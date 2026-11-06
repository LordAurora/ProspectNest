import { startOfDayInTimeZone } from '@prospectnest/core';
import { getDb, type PrismaClient, type RunStatus } from '@prospectnest/db';
import { FetchError, type ResearchOutcome } from '@prospectnest/research';
import { logger } from '../logger';

export type Researcher = (website: string | null) => Promise<ResearchOutcome>;

export type ResearchDeps = {
  db?: PrismaClient;
  research: Researcher;
  concurrency: number;
  /** Called after evidence is stored, so scoring can run on fresh data. */
  afterItem?: (campaignBusinessId: string) => Promise<void>;
  /** Retry backoff base; overridable in tests. */
  backoffMs?: number;
  maxAttempts?: number;
};

const ITEM_BATCH = 20;
const TERMINAL: RunStatus[] = ['completed', 'failed', 'cancelled'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const userMessage: Record<string, string> = {
  timeout: 'Site zamanında yanıt vermedi.',
  network: 'Siteye bağlanılamadı.',
  http_4xx: 'Sayfa açılamadı.',
  http_5xx: 'Site sunucu hatası verdi.',
  rate_limited: 'Site istek sınırına ulaştı.',
  blocked: 'Site doğrulama veya giriş istiyor; atlatma yapılmadı.',
  blocked_address: 'Adres yerel veya özel bir ağa işaret ediyor; güvenlik nedeniyle engellendi.',
  robots_disallowed: 'Site erişim kuralları incelemeye izin vermiyor.',
  invalid_url: 'Web sitesi adresi geçersiz.',
  too_large: 'Sayfa boyutu sınırı aşıyor.',
  not_html: 'Adres bir web sayfası döndürmedi.',
  too_many_redirects: 'Çok fazla yönlendirme.',
};

type RunOptions = { businessIds?: string[] } | null;

/** Bounded exponential backoff with full jitter; only for transient errors. */
export async function researchWithRetry(research: Researcher, website: string | null, maxAttempts: number, baseMs: number) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await research(website);
    } catch (error) {
      const retryable = error instanceof FetchError && error.retryable;
      if (!retryable || attempt >= maxAttempts) throw error;
      await sleep(Math.random() * baseMs * 2 ** (attempt - 1));
    }
  }
}

async function pagesUsedToday(db: PrismaClient, campaignId: string, timezone: string): Promise<number> {
  const result = await db.runItem.aggregate({
    _sum: { pagesFetched: true },
    where: { run: { campaignId }, updatedAt: { gte: startOfDayInTimeZone(new Date(), timezone) } },
  });
  return result._sum.pagesFetched ?? 0;
}

/** Writes the outcome. Evidence is replaced only after a successful inspection; failures keep earlier findings. */
async function persistOutcome(db: PrismaClient, itemId: string, businessId: string, outcome: ResearchOutcome) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    if (outcome.status === 'ok' || outcome.status === 'social_only') {
      await tx.evidence.deleteMany({ where: { businessId } });
      await tx.evidence.createMany({
        data: outcome.observations.map((o) => ({
          businessId,
          signal: o.signal,
          observationStatus: o.status,
          sourceUrl: o.sourceUrl,
          fetchedAt: o.fetchedAt,
          excerpt: o.excerpt,
          contentHash: o.contentHash,
        })),
      });
      if (outcome.contacts.length > 0) {
        await tx.contact.createMany({
          data: outcome.contacts.map((c) => ({ businessId, kind: c.kind, value: c.value, sourceUrl: c.sourceUrl, seenAt: now })),
          skipDuplicates: true,
        });
      }
      await tx.business.update({ where: { id: businessId }, data: { lastCheckedAt: now } });
      await tx.runItem.update({ where: { id: itemId }, data: { status: 'done', pagesFetched: outcome.pagesFetched, errorKind: null, error: null } });
      return;
    }

    if (outcome.status === 'no_website') {
      // Scope is the source record, not the business: "not observed" never claims the business has no site.
      await tx.evidence.deleteMany({ where: { businessId, signal: 'website_present' } });
      await tx.evidence.create({
        data: {
          businessId,
          signal: 'website_present',
          observationStatus: 'not_observed',
          sourceUrl: 'kaynak-kaydi',
          fetchedAt: now,
          excerpt: 'Kaynak kayıtta web sitesi bulunmuyor',
        },
      });
      await tx.runItem.update({ where: { id: itemId }, data: { status: 'done', pagesFetched: 0 } });
      return;
    }

    const kind = outcome.error?.kind ?? outcome.status;
    await tx.runItem.update({
      where: { id: itemId },
      data: {
        status: outcome.status === 'blocked' || outcome.status === 'robots_disallowed' ? 'blocked' : 'failed',
        pagesFetched: outcome.pagesFetched,
        errorKind: kind,
        error: userMessage[kind] ?? outcome.error?.message ?? 'Araştırma tamamlanamadı.',
      },
    });
  });
}

async function finalize(db: PrismaClient, runId: string, cancelled: boolean, pausedReason: string | null) {
  const counts = await db.runItem.groupBy({ by: ['status'], where: { runId }, _count: true });
  const count = (status: string) => counts.find((c) => c.status === status)?._count ?? 0;
  const done = count('done') + count('skipped');
  const failed = count('failed') + count('blocked');
  const pending = count('pending') + count('running');

  let status: RunStatus;
  if (cancelled) status = 'cancelled';
  else if (pending > 0 || (failed > 0 && done > 0)) status = 'partial';
  else if (failed > 0 && done === 0) status = 'failed';
  else status = 'completed';

  await db.run.update({
    where: { id: runId },
    data: {
      status,
      doneItems: done,
      failedItems: failed,
      finishedAt: new Date(),
      error: pausedReason ?? (cancelled ? 'Kullanıcı tarafından iptal edildi.' : null),
      checkpoint: { done, failed, pending },
    },
  });
  return status;
}

/**
 * Executes one research run. Safe to call again after a crash or retry:
 * items are materialised idempotently, half-finished items return to pending,
 * finished items are skipped and evidence writes replace rather than append.
 */
export async function processResearchRun(runId: string, deps: ResearchDeps): Promise<RunStatus | null> {
  const db = deps.db ?? getDb();
  const maxAttempts = deps.maxAttempts ?? 3;
  const backoffMs = deps.backoffMs ?? 2_000;

  const run = await db.run.findUnique({ where: { id: runId }, include: { campaign: true } });
  if (!run || TERMINAL.includes(run.status)) return run?.status ?? null;
  if (run.cancelRequested) return finalize(db, runId, true, null);

  await db.run.update({ where: { id: runId }, data: { status: 'running', startedAt: run.startedAt ?? new Date() } });

  const options = run.options as RunOptions;
  const links = await db.campaignBusiness.findMany({
    where: { campaignId: run.campaignId, ...(options?.businessIds ? { businessId: { in: options.businessIds } } : {}) },
    select: { businessId: true },
  });
  await db.runItem.createMany({ data: links.map((l) => ({ runId, businessId: l.businessId })), skipDuplicates: true });
  await db.runItem.updateMany({ where: { runId, status: 'running' }, data: { status: 'pending' } });
  await db.run.update({ where: { id: runId }, data: { totalItems: await db.runItem.count({ where: { runId } }) } });

  // Branches of a chain share a website; inspect it once per run.
  const cache = new Map<string, Promise<ResearchOutcome>>();
  const cacheOwner = new Map<string, string>();
  let pausedReason: string | null = null;

  for (;;) {
    const fresh = await db.run.findUniqueOrThrow({ where: { id: runId }, select: { cancelRequested: true } });
    if (fresh.cancelRequested) return finalize(db, runId, true, null);

    const used = await pagesUsedToday(db, run.campaignId, run.campaign.timezone);
    if (used >= run.campaign.dailyPageBudget) {
      pausedReason = 'Günlük sayfa bütçesi doldu; kalan işletmeler bir sonraki çalışmada araştırılır.';
      break;
    }

    const items = await db.runItem.findMany({
      where: { runId, status: 'pending' },
      take: ITEM_BATCH,
      orderBy: { createdAt: 'asc' },
      select: { id: true, businessId: true },
    });
    if (items.length === 0) break;

    const queue = [...items];
    const workers = Array.from({ length: Math.max(1, deps.concurrency) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        if (!item.businessId) continue;
        const business = await db.business.findUniqueOrThrow({ where: { id: item.businessId }, select: { id: true, website: true } });
        await db.runItem.update({ where: { id: item.id }, data: { status: 'running', attempts: { increment: 1 } } });

        const key = business.website?.toLowerCase() ?? `none:${business.id}`;
        if (!cache.has(key)) {
          cache.set(key, researchWithRetry(deps.research, business.website, maxAttempts, backoffMs));
          cacheOwner.set(key, item.id);
        }
        // Only the item that triggered the fetch is charged pages against the daily budget.
        const reused = cacheOwner.get(key) !== item.id;
        let outcome: ResearchOutcome;
        try {
          outcome = await cache.get(key)!;
        } catch (error) {
          const kind = error instanceof FetchError ? error.kind : 'network';
          outcome = { status: 'unreachable', observations: [], contacts: [], pagesFetched: 1, error: { kind, message: String(error) } };
          if (!(error instanceof FetchError)) logger.error('araştırma hatası', { runId, businessId: business.id, error: String(error) });
        }
        await persistOutcome(db, item.id, business.id, reused ? { ...outcome, pagesFetched: 0 } : outcome);

        if (deps.afterItem && (outcome.status === 'ok' || outcome.status === 'social_only' || outcome.status === 'no_website')) {
          const link = await db.campaignBusiness.findUnique({
            where: { campaignId_businessId: { campaignId: run.campaignId, businessId: business.id } },
            select: { id: true },
          });
          if (link) await deps.afterItem(link.id);
        }
        await db.run.update({
          where: { id: runId },
          data: outcome.status === 'ok' || outcome.status === 'social_only' || outcome.status === 'no_website' ? { doneItems: { increment: 1 } } : { failedItems: { increment: 1 } },
        });
      }
    });
    await Promise.all(workers);
  }

  const status = await finalize(db, runId, false, pausedReason);
  logger.info('araştırma çalışması bitti', { runId, status });
  return status;
}
