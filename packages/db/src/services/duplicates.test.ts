import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Requires a disposable, migrated PostgreSQL: TEST_DATABASE_URL=... pnpm --filter @prospectnest/db test */
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('mergeDuplicate (PostgreSQL)', () => {
  let db: ReturnType<typeof import('../client')['getDb']>;
  let merge: typeof import('./duplicates')['mergeDuplicate'];
  const campaignIds: string[] = [];
  const businessIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = (await import('../client')).getDb();
    merge = (await import('./duplicates')).mergeDuplicate;
  });

  afterAll(async () => {
    await db.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    await db.business.deleteMany({ where: { id: { in: businessIds } } });
    await db.$disconnect();
  });

  it('moves sources, contacts and campaign links to the kept record without overwriting it', async () => {
    const campaign = (name: string) =>
      db.campaign.create({ data: { name: `${name}-${randomUUID()}`, serviceDescription: 't', template: 'qr_menu', countries: ['TR'], cities: [], categories: ['Kafe'] } });
    const [shared, onlyDuplicate] = await Promise.all([campaign('shared'), campaign('dup')]);
    campaignIds.push(shared.id, onlyDuplicate.id);

    const kept = await db.business.create({
      data: { name: 'Bademli', normalizedName: 'bademli', city: 'İzmir', website: 'https://bademli.example', contacts: { create: { kind: 'phone', value: '+902320000008' } } },
    });
    const duplicate = await db.business.create({
      data: {
        name: 'Bademli',
        normalizedName: 'bademli',
        city: 'İzmir',
        address: 'Kazımdirik Mah.',
        website: 'https://other.example',
        duplicateOfId: kept.id,
        contacts: { create: [{ kind: 'phone', value: '+902320000008' }, { kind: 'email', value: 'a@bademli.example' }] },
        sources: { create: { provider: 'csv', externalId: `x-${randomUUID()}` } },
      },
    });
    businessIds.push(kept.id, duplicate.id);
    await db.campaignBusiness.createMany({
      data: [
        { campaignId: shared.id, businessId: kept.id },
        { campaignId: shared.id, businessId: duplicate.id },
        { campaignId: onlyDuplicate.id, businessId: duplicate.id },
      ],
    });

    await expect(merge(db, duplicate.id)).resolves.toEqual({ keptId: kept.id });

    const survivor = await db.business.findUniqueOrThrow({ where: { id: kept.id }, include: { contacts: true, sources: true, campaigns: true } });
    expect(survivor.website).toBe('https://bademli.example');
    expect(survivor.address).toBe('Kazımdirik Mah.');
    expect(survivor.contacts.map((c) => c.value).sort()).toEqual(['+902320000008', 'a@bademli.example']);
    expect(survivor.sources).toHaveLength(1);
    expect(survivor.campaigns.map((c) => c.campaignId).sort()).toEqual([shared.id, onlyDuplicate.id].sort());
    expect(await db.business.findUnique({ where: { id: duplicate.id } })).toBeNull();
  });
});
