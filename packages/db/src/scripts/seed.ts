/**
 * Loads the clearly labelled synthetic demo dataset. Every row is flagged with
 * isDemo and uses reserved `.example` domains, so it can never be mistaken for
 * (or exported as) a real lead list. Re-running replaces the previous demo data.
 */
import path from 'node:path';
import { config } from 'dotenv';
import { defaultRuleSet, normalizeDomain, normalizeName, normalizePhone } from '@prospectnest/core';
import { getDb } from '../client';
import type { ObservationStatus } from '../generated/prisma/client';
import { evaluateCampaignBusiness } from '../services/scoring';

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
    signals: [{ signal: 'website_present', status: 'unknown', path: '/' }],
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
        rules: defaultRuleSet('qr_menu'),
        source: 'csv',
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
              exportPolicy: 'forbidden',
              fieldOrigins: { name: 'demo', website: 'demo', phone: 'demo' },
            },
          },
        },
      });

      const contacts = [
        item.email ? { kind: 'email' as const, value: item.email } : null,
        item.phone ? { kind: 'phone' as const, value: normalizePhone(item.phone) ?? item.phone } : null,
      ].filter((c) => c !== null);
      if (contacts.length > 0) {
        await tx.contact.createMany({
          data: contacts.map((c) => ({ ...c, businessId: business.id, sourceUrl: item.website })),
        });
      }

      for (const signal of item.signals) {
        await tx.evidence.create({
          data: {
            businessId: business.id,
            signal: signal.signal,
            observationStatus: signal.status,
            sourceUrl: `${item.website ?? 'kaynak-kaydi'}${signal.path}`,
            fetchedAt: now,
            excerpt: signal.excerpt ?? null,
          },
        });
      }
      if (item.signals.some((s) => s.status === 'unknown')) failed += 1;
      else done += 1;

      // Scores come from the same rule engine the worker uses.
      const lead = await tx.campaignBusiness.create({ data: { campaignId: campaign.id, businessId: business.id } });
      if (item.signals.length > 0) await evaluateCampaignBusiness(tx, lead.id);
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
