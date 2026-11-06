import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FetchError, type ResearchOutcome } from '@prospectnest/research';
import { processResearchRun, researchWithRetry } from './research';

const okOutcome = (url: string): ResearchOutcome => ({
  status: 'ok',
  pagesFetched: 2,
  contacts: [{ kind: 'email', value: 'merhaba@test.example', sourceUrl: url }],
  observations: [
    { signal: 'website_present', status: 'present', sourceUrl: url, excerpt: null, contentHash: 'h', fetchedAt: new Date() },
    { signal: 'pdf_or_image_menu', status: 'present', sourceUrl: `${url}menu.pdf`, excerpt: 'Menü', contentHash: 'h', fetchedAt: new Date() },
  ],
});

describe('researchWithRetry', () => {
  it('retries transient failures with backoff, then succeeds', async () => {
    const research = vi
      .fn()
      .mockRejectedValueOnce(new FetchError('timeout', 't'))
      .mockRejectedValueOnce(new FetchError('http_5xx', 's', 503))
      .mockResolvedValue(okOutcome('https://a.example/'));
    await expect(researchWithRetry(research, 'https://a.example/', 3, 1)).resolves.toMatchObject({ status: 'ok' });
    expect(research).toHaveBeenCalledTimes(3);
  });

  it('does not retry permanent errors', async () => {
    const research = vi.fn().mockRejectedValue(new FetchError('http_4xx', 'nf', 404));
    await expect(researchWithRetry(research, 'https://a.example/', 3, 1)).rejects.toMatchObject({ kind: 'http_4xx' });
    expect(research).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt limit', async () => {
    const research = vi.fn().mockRejectedValue(new FetchError('timeout', 't'));
    await expect(researchWithRetry(research, 'https://a.example/', 3, 1)).rejects.toMatchObject({ kind: 'timeout' });
    expect(research).toHaveBeenCalledTimes(3);
  });
});

/**
 * Runs against a real, disposable PostgreSQL with migrations applied:
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @prospectnest/worker test
 */
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('processResearchRun (PostgreSQL)', () => {
  let db: Awaited<ReturnType<typeof import('@prospectnest/db')['getDb']>>;
  let campaignId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = (await import('@prospectnest/db')).getDb();
    const campaign = await db.campaign.create({
      data: { name: `test-${randomUUID()}`, serviceDescription: 'test', template: 'qr_menu', countries: ['TR'], cities: [], categories: ['Kafe'] },
    });
    campaignId = campaign.id;
    for (const [name, website] of [
      ['A Şube 1', 'https://chain.example/'],
      ['A Şube 2', 'https://chain.example/'],
      ['B', 'https://b.example/'],
      ['C', null],
    ] as const) {
      const business = await db.business.create({ data: { name, normalizedName: name.toLowerCase(), website, city: 'İzmir' } });
      await db.campaignBusiness.create({ data: { campaignId, businessId: business.id } });
    }
  });

  afterAll(async () => {
    if (campaignId) {
      const links = await db.campaignBusiness.findMany({ where: { campaignId }, select: { businessId: true } });
      await db.campaign.delete({ where: { id: campaignId } });
      await db.business.deleteMany({ where: { id: { in: links.map((l) => l.businessId) } } });
    }
    await db.$disconnect();
  });

  it('resumes after a crash without duplicating evidence and fetches a shared site once', async () => {
    const run = await db.run.create({ data: { campaignId, kind: 'research', status: 'running' } });
    // Simulate a worker that died mid-run: items exist, one was left "running".
    const links = await db.campaignBusiness.findMany({ where: { campaignId }, select: { businessId: true } });
    await db.runItem.createMany({ data: links.map((l) => ({ runId: run.id, businessId: l.businessId })) });
    await db.runItem.updateMany({ where: { runId: run.id }, data: { status: 'running' } });

    const research = vi.fn(async (website: string | null) =>
      website ? okOutcome(website) : ({ status: 'no_website', observations: [], contacts: [], pagesFetched: 0 } as ResearchOutcome),
    );
    await expect(processResearchRun(run.id, { db, research, concurrency: 2 })).resolves.toBe('completed');
    expect(research.mock.calls.filter(([w]) => w === 'https://chain.example/')).toHaveLength(1);

    // A second delivery of the same job (at-least-once queue) changes nothing.
    await expect(processResearchRun(run.id, { db, research, concurrency: 2 })).resolves.toBe('completed');

    const evidence = await db.evidence.count({ where: { business: { campaigns: { some: { campaignId } } } } });
    expect(evidence).toBe(2 * 3 + 1);
    const items = await db.runItem.findMany({ where: { runId: run.id } });
    expect(items.every((i) => i.status === 'done')).toBe(true);
    expect(items.reduce((sum, i) => sum + i.pagesFetched, 0)).toBe(4);
  });

  it('stops at a safe point when cancelled', async () => {
    const run = await db.run.create({ data: { campaignId, kind: 'research', cancelRequested: true } });
    await expect(processResearchRun(run.id, { db, research: vi.fn(), concurrency: 1 })).resolves.toBe('cancelled');
  });
});
