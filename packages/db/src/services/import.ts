import { createHash } from 'node:crypto';
import {
  branchKey,
  normalizeDomain,
  normalizeName,
  normalizePhone,
  type BusinessInput,
} from '@prospectnest/core';
import type { PrismaClient } from '../generated/prisma/client';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export type ImportRow = { row: number; value: BusinessInput };
export type ImportRowError = { row: number; errors: string[] };

export type ImportCounters = {
  /** New business records. */
  created: number;
  /** Rows that matched an existing business (source refreshed, empty fields filled). */
  matched: number;
  /** Businesses newly attached to this campaign. */
  linked: number;
  /** Businesses that were already in this campaign. */
  alreadyInCampaign: number;
  /** Created but flagged for review: same name and city as another record without a shared identifier. */
  possibleDuplicates: number;
  /** Rows repeating an earlier row of the same file. */
  repeatedInFile: number;
  invalid: number;
};

export type ImportResult = { runId: string; counters: ImportCounters; errors: ImportRowError[] };

const emptyCounters = (): ImportCounters => ({
  created: 0,
  matched: 0,
  linked: 0,
  alreadyInCampaign: 0,
  possibleDuplicates: 0,
  repeatedInFile: 0,
  invalid: 0,
});

const BATCH_SIZE = 100;
const MAX_STORED_ERRORS = 200;

/**
 * Stable identity for rows without a source id: re-importing the same row
 * always yields the same key, so repeating an import never grows the table.
 */
function autoExternalId(domain: string | null, input: BusinessInput): string {
  const digest = createHash('sha256').update(`${domain ?? ''}#${branchKey(input)}`).digest('hex');
  return `auto:${digest.slice(0, 32)}`;
}

async function findExisting(tx: Tx, provider: string, externalId: string, domain: string | null, input: BusinessInput) {
  const source = await tx.businessSource.findUnique({
    where: { provider_externalId: { provider, externalId } },
    select: { businessId: true },
  });
  if (source) return { id: source.businessId, kind: 'match' as const };

  const normalizedName = normalizeName(input.name);
  const key = branchKey(input);

  if (domain) {
    // Chain branches share a domain: only the same branch (name + location) or the same address merges.
    const sameDomain = await tx.business.findMany({
      where: { domain },
      select: { id: true, name: true, city: true, district: true, address: true },
    });
    const address = input.address ? normalizeName(input.address) : null;
    const hit = sameDomain.find(
      (candidate) =>
        branchKey({ name: candidate.name, city: candidate.city ?? undefined, district: candidate.district ?? undefined, address: candidate.address ?? undefined }) === key ||
        (address !== null && candidate.address !== null && normalizeName(candidate.address) === address),
    );
    if (hit) return { id: hit.id, kind: 'match' as const };
  }

  // Same name in the same city without a shared identifier is only a possible duplicate.
  const sameName = await tx.business.findMany({
    where: { normalizedName },
    select: { id: true, city: true },
    take: 20,
  });
  const city = normalizeName(input.city ?? '');
  const similar = sameName.find((candidate) => normalizeName(candidate.city ?? '') === city);
  return similar ? { id: similar.id, kind: 'similar' as const } : null;
}

async function importRow(
  tx: Tx,
  campaignId: string,
  provider: string,
  { value: input }: ImportRow,
  seen: Set<string>,
  counters: ImportCounters,
) {
  const domain = normalizeDomain(input.website);
  const externalId = input.externalId ?? autoExternalId(domain, input);
  const existing = await findExisting(tx, provider, externalId, domain, input);
  const now = new Date();

  let businessId: string;
  if (existing?.kind === 'match') {
    businessId = existing.id;
    if (seen.has(businessId)) {
      counters.repeatedInFile += 1;
      return;
    }
    counters.matched += 1;
    const current = await tx.business.findUniqueOrThrow({ where: { id: businessId } });
    // Fill gaps only: an import never blanks or overwrites previously known values.
    await tx.business.update({
      where: { id: businessId },
      data: {
        website: current.website ?? input.website ?? null,
        domain: current.domain ?? domain,
        country: current.country ?? input.country ?? null,
        city: current.city ?? input.city ?? null,
        district: current.district ?? input.district ?? null,
        address: current.address ?? input.address ?? null,
        category: current.category ?? input.category ?? null,
      },
    });
  } else {
    const created = await tx.business.create({
      data: {
        name: input.name,
        normalizedName: normalizeName(input.name),
        website: input.website ?? null,
        domain,
        country: input.country ?? null,
        city: input.city ?? null,
        district: input.district ?? null,
        address: input.address ?? null,
        category: input.category ?? null,
        duplicateOfId: existing?.kind === 'similar' ? existing.id : null,
      },
    });
    businessId = created.id;
    counters.created += 1;
    if (existing?.kind === 'similar') counters.possibleDuplicates += 1;
  }
  seen.add(businessId);

  const fieldOrigins = Object.fromEntries(
    Object.entries(input)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => [k, provider]),
  );
  await tx.businessSource.upsert({
    where: { provider_externalId: { provider, externalId } },
    create: { businessId, provider, externalId, fieldOrigins, firstSeenAt: now, lastSeenAt: now },
    update: { lastSeenAt: now },
  });

  const contacts = [
    input.email ? { kind: 'email' as const, value: input.email.toLowerCase() } : null,
    input.phone ? { kind: 'phone' as const, value: normalizePhone(input.phone) ?? input.phone } : null,
  ].filter((contact) => contact !== null);
  if (contacts.length > 0) {
    await tx.contact.createMany({
      data: contacts.map((contact) => ({ ...contact, businessId, sourceUrl: null })),
      skipDuplicates: true,
    });
  }

  const link = await tx.campaignBusiness.findUnique({
    where: { campaignId_businessId: { campaignId, businessId } },
    select: { id: true },
  });
  if (link) {
    counters.alreadyInCampaign += 1;
  } else {
    await tx.campaignBusiness.create({
      data: { campaignId, businessId, contactability: contacts.length },
    });
    counters.linked += 1;
  }
}

/**
 * Imports validated rows into a campaign and records the outcome as an
 * `import` run. Rows are committed in batches, so a failure keeps the earlier
 * batches and marks the run `partial`; re-running the same file is safe.
 */
export async function importBusinesses(
  db: PrismaClient,
  params: { campaignId: string; provider: 'csv' | 'manual'; rows: ImportRow[]; invalid: ImportRowError[]; fileName?: string },
): Promise<ImportResult> {
  const { campaignId, provider, rows, invalid } = params;
  const counters: ImportCounters = { ...emptyCounters(), invalid: invalid.length };
  const errors: ImportRowError[] = [...invalid];

  const run = await db.run.create({
    data: {
      campaignId,
      kind: 'import',
      status: 'running',
      totalItems: rows.length + invalid.length,
      startedAt: new Date(),
    },
  });

  const seen = new Set<string>();
  let processed = 0;
  let failure: string | null = null;

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    // Counters and the seen-set are only merged once the batch has committed.
    const batchCounters = emptyCounters();
    const batchSeen = new Set(seen);
    try {
      await db.$transaction(
        async (tx) => {
          for (const row of batch) await importRow(tx, campaignId, provider, row, batchSeen, batchCounters);
        },
        { timeout: 60_000 },
      );
      for (const key of Object.keys(batchCounters) as (keyof ImportCounters)[]) counters[key] += batchCounters[key];
      for (const id of batchSeen) seen.add(id);
      processed += batch.length;
      await db.run.update({ where: { id: run.id }, data: { doneItems: processed, checkpoint: { processed } } });
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      break;
    }
  }

  const status = failure ? (processed > 0 ? 'partial' : 'failed') : 'completed';
  await db.run.update({
    where: { id: run.id },
    data: {
      status,
      doneItems: processed,
      failedItems: invalid.length + (rows.length - processed),
      newBusinesses: counters.created,
      updatedBusinesses: counters.matched,
      error: failure ? 'İçe aktarma yarıda kaldı. Aynı dosyayı yeniden yüklemek güvenlidir; mevcut kayıtlar çoğalmaz.' : null,
      summary: { provider, fileName: params.fileName ?? null, counters, errors: errors.slice(0, MAX_STORED_ERRORS) },
      finishedAt: new Date(),
    },
  });

  return { runId: run.id, counters, errors };
}
