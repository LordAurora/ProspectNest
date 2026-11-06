import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Requires a disposable, migrated PostgreSQL: TEST_DATABASE_URL=... pnpm --filter @prospectnest/worker test */
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('planScheduledRuns (PostgreSQL)', () => {
  let db: Awaited<ReturnType<typeof import('@prospectnest/db')['getDb']>>;
  let plan: typeof import('./scheduler')['planScheduledRuns'];
  let campaignId: string;
  const businessIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = (await import('@prospectnest/db')).getDb();
    plan = (await import('./scheduler')).planScheduledRuns;
    const campaign = await db.campaign.create({
      data: {
        name: `schedule-${randomUUID()}`,
        serviceDescription: 'test',
        template: 'qr_menu',
        countries: ['TR'],
        cities: [],
        categories: ['Kafe'],
        scheduleEnabled: true,
        recheckHour: 0,
        recheckIntervalDays: 7,
      },
    });
    campaignId = campaign.id;
    for (const [name, lastCheckedAt] of [
      ['Eski', new Date('2026-10-01')],
      ['Yeni', new Date()],
    ] as const) {
      const business = await db.business.create({ data: { name, normalizedName: name, website: `https://${name}.example`, lastCheckedAt } });
      businessIds.push(business.id);
      await db.campaignBusiness.create({ data: { campaignId, businessId: business.id } });
    }
  });

  afterAll(async () => {
    if (campaignId) await db.campaign.delete({ where: { id: campaignId } });
    await db.business.deleteMany({ where: { id: { in: businessIds } } });
    await db.$disconnect();
  });

  it('creates one recheck run for stale businesses even when two schedulers race', async () => {
    const now = new Date();
    await Promise.all([plan(db, now), plan(db, now)]);
    await plan(db, new Date(now.getTime() + 60_000));

    const runs = await db.run.findMany({ where: { campaignId, kind: 'recheck' } });
    expect(runs).toHaveLength(1);
    expect((runs[0]?.options as { businessIds: string[] }).businessIds).toEqual([businessIds[0]]);
  });
});
