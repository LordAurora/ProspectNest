import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlacesClient, type PlacesFetch } from '@prospectnest/integrations';

/** Requires a disposable, migrated PostgreSQL: TEST_DATABASE_URL=... pnpm --filter @prospectnest/worker test */
const databaseUrl = process.env.TEST_DATABASE_URL;

/** Fake Places API answering every Text Search with the given place IDs (20 per page). */
function fakePlaces(ids: string[]) {
  let requests = 0;
  const fetcher: PlacesFetch = async (_url, init) => {
    requests += 1;
    const body = JSON.parse(init.body ?? '{}') as { pageToken?: string };
    const start = body.pageToken ? Number(body.pageToken) : 0;
    const slice = ids.slice(start, start + 20);
    const next = start + 20 < ids.length ? String(start + 20) : undefined;
    return { status: 200, json: async () => ({ places: slice.map((id) => ({ id })), ...(next ? { nextPageToken: next } : {}) }) };
  };
  return { client: new PlacesClient('test-key', fetcher), requests: () => requests };
}

describe.skipIf(!databaseUrl)('processDiscoveryRun (PostgreSQL)', () => {
  let db: Awaited<ReturnType<typeof import('@prospectnest/db')['getDb']>>;
  let processRun: typeof import('./discovery')['processDiscoveryRun'];
  let campaignId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = (await import('@prospectnest/db')).getDb();
    processRun = (await import('./discovery')).processDiscoveryRun;
    const campaign = await db.campaign.create({
      data: { name: `places-${randomUUID()}`, serviceDescription: 't', template: 'qr_menu', countries: ['TR'], cities: ['Bartın'], categories: ['Kafe'] },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    if (campaignId) await db.campaign.delete({ where: { id: campaignId } });
    await db.$disconnect();
  });

  const newRun = (maxResults: number) =>
    db.run.create({ data: { campaignId, kind: 'discovery', status: 'queued', options: { textQuery: 'Kafe Bartın', regionCode: 'TR', maxResults } } });

  it('stores only place IDs and never duplicates them across runs', async () => {
    const ids = Array.from({ length: 45 }, (_, i) => `place-${i}`);
    const first = await newRun(60);
    await processRun(first.id, fakePlaces(ids).client, 1000, db);
    expect(await db.run.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: 'completed', newBusinesses: 45, apiRequests: 3 });

    const second = await newRun(60);
    await processRun(second.id, fakePlaces(ids).client, 1000, db);
    expect(await db.run.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ status: 'completed', newBusinesses: 0, updatedBusinesses: 45 });
    expect(await db.discoveredPlace.count({ where: { campaignId } })).toBe(45);
  });

  it('stops at the daily request cap with what it already found', async () => {
    const used = await db.run.aggregate({ _sum: { apiRequests: true }, where: { kind: 'discovery' } });
    const run = await newRun(60);
    const places = fakePlaces(Array.from({ length: 60 }, (_, i) => `cap-${i}`));
    await processRun(run.id, places.client, (used._sum.apiRequests ?? 0) + 1, db);
    const result = await db.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(result.status).toBe('partial');
    expect(result.error).toContain('Günlük');
    expect(places.requests()).toBe(1);
  });

  it('honours a cancel request', async () => {
    const run = await db.run.create({
      data: { campaignId, kind: 'discovery', status: 'running', cancelRequested: true, options: { textQuery: 'q', maxResults: 20 } },
    });
    const places = fakePlaces(['x']);
    await processRun(run.id, places.client, 1000, db);
    expect((await db.run.findUniqueOrThrow({ where: { id: run.id } })).status).toBe('cancelled');
    expect(places.requests()).toBe(0);
  });
});
