/**
 * Loads the clearly labelled synthetic demo dataset. Every row is flagged with
 * isDemo and uses reserved `.example` domains, so it can never be mistaken for
 * (or exported as) a real lead list. Re-running replaces the previous demo data.
 */
import path from 'node:path';
import { config } from 'dotenv';
import { normalizeDomain, normalizeName } from '@prospectnest/core';
import { getDb } from '../client';
import type { ObservationStatus, Priority } from '../generated/prisma/client';

config({ path: path.resolve(import.meta.dirname, '../../../../.env'), quiet: true });

type DemoSignal = { signal: string; status: ObservationStatus; path: string; excerpt?: string };

type DemoBusiness = {
  key: string;
  name: string;
  city: string;
  district: string;
  category: string;
  website: string | null;
  email?: string;
  phone?: string;
  signals: DemoSignal[];
};

// Mirrors the QR menu starter weights in the master plan (§9). Phase 4 replaces
// this with the versioned rule engine; until then the seed computes the same numbers.
const QR_BASE_SCORE = 50;
const QR_IMPACT: Record<string, number> = {
  pdf_or_image_menu: 15,
  menu_by_phone_request: 10,
  digital_menu_link: -35,
};

const businesses: DemoBusiness[] = [
  {
    key: 'demo-001',
    name: 'Lavanta Kahve Evi',
    city: 'İstanbul',
    district: 'Kadıköy',
    category: 'Kafe',
    website: 'https://lavanta-kahve.example',
    email: 'merhaba@lavanta-kahve.example',
    phone: '+90 216 000 00 01',
    signals: [
      { signal: 'pdf_or_image_menu', status: 'present', path: '/menu', excerpt: 'Menümüzü PDF olarak indirin' },
      { signal: 'digital_menu_link', status: 'not_observed', path: '/' },
    ],
  },
  {
    key: 'demo-002',
    name: 'Simit Köşesi Moda Şubesi',
    city: 'İstanbul',
    district: 'Kadıköy',
    category: 'Fırın',
    website: 'https://simitkosesi.example',
    phone: '+90 216 000 00 02',
    signals: [
      { signal: 'digital_menu_link', status: 'present', path: '/', excerpt: 'Dijital menüye buradan ulaşın' },
    ],
  },
  {
    key: 'demo-003',
    name: 'Simit Köşesi Beşiktaş Şubesi',
    city: 'İstanbul',
    district: 'Beşiktaş',
    category: 'Fırın',
    website: 'https://simitkosesi.example',
    phone: '+90 212 000 00 03',
    signals: [
      { signal: 'digital_menu_link', status: 'present', path: '/', excerpt: 'Dijital menüye buradan ulaşın' },
    ],
  },
  {
    key: 'demo-004',
    name: 'Ege Sofrası Balık Restoranı ve Meyhane',
    city: 'İzmir',
    district: 'Alsancak',
    category: 'Restoran',
    website: 'https://egesofrasi.example',
    email: 'rezervasyon@egesofrasi.example',
    signals: [
      { signal: 'pdf_or_image_menu', status: 'present', path: '/menu', excerpt: 'Menü görselleri' },
      {
        signal: 'menu_by_phone_request',
        status: 'present',
        path: '/iletisim',
        excerpt: 'Güncel menü için WhatsApp hattımızdan yazabilirsiniz',
      },
    ],
  },
  {
    key: 'demo-005',
    name: 'Kordon Pide Salonu',
    city: 'İzmir',
    district: 'Konak',
    category: 'Restoran',
    website: 'https://kordonpide.example',
    signals: [{ signal: 'site_reachable', status: 'unknown', path: '/' }],
  },
  {
    key: 'demo-006',
    name: 'Anka Burger',
    city: 'Ankara',
    district: 'Çankaya',
    category: 'Fast food',
    website: 'https://ankaburger.example',
    email: 'iletisim@ankaburger.example',
    signals: [
      { signal: 'pdf_or_image_menu', status: 'not_observed', path: '/' },
      { signal: 'digital_menu_link', status: 'not_observed', path: '/' },
    ],
  },
  {
    key: 'demo-007',
    name: 'Tunalı Çay Bahçesi',
    city: 'Ankara',
    district: 'Çankaya',
    category: 'Kafe',
    website: null,
    phone: '+90 312 000 00 07',
    signals: [],
  },
  {
    key: 'demo-008',
    name: 'Bademli Ev Yemekleri',
    city: 'İzmir',
    district: 'Bornova',
    category: 'Lokanta',
    website: 'https://bademli.example',
    phone: '+90 232 000 00 08',
    signals: [
      {
        signal: 'menu_by_phone_request',
        status: 'present',
        path: '/',
        excerpt: 'Günün menüsünü öğrenmek için bizi arayın',
      },
    ],
  },
  {
    key: 'demo-009',
    name: 'Galata Tatlıcısı',
    city: 'İstanbul',
    district: 'Beyoğlu',
    category: 'Tatlıcı',
    website: 'https://galatatatli.example',
    signals: [{ signal: 'pdf_or_image_menu', status: 'present', path: '/fiyatlar', excerpt: 'Fiyat listesi (görsel)' }],
  },
  {
    key: 'demo-010',
    name: 'Kızılay Döner',
    city: 'Ankara',
    district: 'Kızılay',
    category: 'Restoran',
    website: 'https://kizilaydoner.example',
    signals: [{ signal: 'digital_menu_link', status: 'present', path: '/', excerpt: 'QR menü' }],
  },
];

function evaluate(signals: DemoSignal[]): { score: number; priority: Priority; coverage: number } {
  const known = signals.filter((s) => s.status !== 'unknown');
  if (known.length === 0) return { score: QR_BASE_SCORE, priority: 'not_evaluated', coverage: 0 };
  const raw = known
    .filter((s) => s.status === 'present')
    .reduce((sum, s) => sum + (QR_IMPACT[s.signal] ?? 0), QR_BASE_SCORE);
  const score = Math.max(0, Math.min(100, raw));
  const priority: Priority = score >= 65 ? 'high' : score >= 45 ? 'medium' : 'low';
  return { score, priority, coverage: known.length / Math.max(signals.length, 1) };
}

async function main() {
  const db = getDb();
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.campaign.deleteMany({ where: { isDemo: true } });
    await tx.business.deleteMany({ where: { isDemo: true } });

    const campaign = await tx.campaign.create({
      data: {
        name: 'Demo · QR menü — Ege ve İç Anadolu',
        serviceDescription: 'Restoran ve kafeler için QR menü kurulumu',
        template: 'qr_menu',
        countries: ['TR'],
        cities: ['İstanbul', 'İzmir', 'Ankara'],
        categories: ['Kafe', 'Restoran', 'Fırın', 'Lokanta', 'Tatlıcı'],
        isDemo: true,
      },
    });

    let done = 0;
    let failed = 0;
    for (const item of businesses) {
      const domain = normalizeDomain(item.website);
      const business = await tx.business.create({
        data: {
          name: item.name,
          normalizedName: normalizeName(item.name),
          website: item.website,
          domain,
          country: 'TR',
          city: item.city,
          district: item.district,
          category: item.category,
          lastCheckedAt: item.signals.length > 0 ? now : null,
          isDemo: true,
          sources: {
            create: {
              provider: 'demo',
              externalId: item.key,
              attribution: 'Sentetik demo verisi',
              fieldOrigins: { name: 'demo', website: 'demo', phone: 'demo' },
            },
          },
        },
      });

      const contacts = [
        item.email ? { kind: 'email' as const, value: item.email } : null,
        item.phone ? { kind: 'phone' as const, value: item.phone } : null,
      ].filter((c) => c !== null);
      if (contacts.length > 0) {
        await tx.contact.createMany({
          data: contacts.map((c) => ({ ...c, businessId: business.id, sourceUrl: item.website })),
        });
      }

      const evidenceIds: string[] = [];
      for (const signal of item.signals) {
        const evidence = await tx.evidence.create({
          data: {
            businessId: business.id,
            signal: signal.signal,
            observationStatus: signal.status,
            sourceUrl: `${item.website ?? ''}${signal.path}`,
            fetchedAt: now,
            excerpt: signal.excerpt ?? null,
          },
        });
        evidenceIds.push(evidence.id);
      }

      const result = item.signals.length > 0 ? evaluate(item.signals) : null;
      if (item.signals.some((s) => s.status === 'unknown')) failed += 1;
      else done += 1;

      await tx.campaignBusiness.create({
        data: {
          campaignId: campaign.id,
          businessId: business.id,
          opportunityScore: result?.score ?? null,
          evidenceCoverage: result?.coverage ?? null,
          contactability: contacts.length,
          priority: result?.priority ?? 'not_evaluated',
          lastEvaluatedAt: result ? now : null,
          ...(result
            ? {
                evaluations: {
                  create: {
                    ruleVersion: 1,
                    score: result.score,
                    evidenceCoverage: result.coverage,
                    contactability: contacts.length,
                    priority: result.priority,
                    results: item.signals.map((s, index) => ({
                      signal: s.signal,
                      status: s.status,
                      impact: s.status === 'present' ? (QR_IMPACT[s.signal] ?? 0) : 0,
                      evidenceIds: evidenceIds.slice(index, index + 1),
                    })),
                    evidenceIds,
                  },
                },
              }
            : {}),
        },
      });
    }

    await tx.run.create({
      data: {
        campaignId: campaign.id,
        kind: 'research',
        status: failed > 0 ? 'partial' : 'completed',
        totalItems: businesses.length,
        doneItems: done,
        failedItems: failed,
        newBusinesses: businesses.length,
        startedAt: new Date(now.getTime() - 4 * 60_000),
        finishedAt: now,
      },
    });
  });

  console.log(`Demo verisi yüklendi: ${businesses.length} sentetik işletme.`);
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
