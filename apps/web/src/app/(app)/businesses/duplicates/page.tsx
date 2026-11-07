import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyCheck } from 'lucide-react';
import { db } from '@/lib/db';
import { formatRelative } from '@/lib/format';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader, Panel } from '@/components/ui/panel';
import { DecisionButtons } from './decision-buttons';

export const metadata: Metadata = { title: 'Olası eşleşmeler' };
export const dynamic = 'force-dynamic';

const businessSelect = {
  id: true,
  name: true,
  city: true,
  district: true,
  address: true,
  website: true,
  category: true,
  createdAt: true,
  contacts: { select: { kind: true, value: true } },
  sources: { select: { provider: true } },
  campaigns: { select: { campaign: { select: { name: true } } } },
} as const;

type Card = {
  name: string;
  city: string | null;
  district: string | null;
  address: string | null;
  website: string | null;
  category: string | null;
  createdAt: Date;
  contacts: { kind: string; value: string }[];
  sources: { provider: string }[];
  campaigns: { campaign: { name: string } }[];
};

function Facts({ title, business, compareTo }: { title: string; business: Card; compareTo: Card }) {
  const rows: [string, string | null, string | null][] = [
    ['Konum', [business.district, business.city].filter(Boolean).join(', ') || null, [compareTo.district, compareTo.city].filter(Boolean).join(', ') || null],
    ['Adres', business.address, compareTo.address],
    ['Web sitesi', business.website, compareTo.website],
    ['Kategori', business.category, compareTo.category],
    ['Telefon', business.contacts.filter((c) => c.kind === 'phone').map((c) => c.value).join(', ') || null, compareTo.contacts.filter((c) => c.kind === 'phone').map((c) => c.value).join(', ') || null],
    ['E-posta', business.contacts.filter((c) => c.kind === 'email').map((c) => c.value).join(', ') || null, compareTo.contacts.filter((c) => c.kind === 'email').map((c) => c.value).join(', ') || null],
    ['Kaynak', [...new Set(business.sources.map((s) => s.provider))].join(', ') || null, null],
    ['Kampanyalar', business.campaigns.map((c) => c.campaign.name).join(', ') || null, null],
  ];
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[12px] font-medium text-fg-muted">{title}</p>
      <p className="mt-0.5 truncate text-[15px] font-semibold text-fg">{business.name}</p>
      <dl className="mt-2 grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
        {rows.map(([label, value, other]) => (
          <div key={label} className="contents">
            <dt className="text-fg-subtle">{label}</dt>
            {/* Differences are marked so the decision is quick. */}
            <dd className={value && other !== null && value !== other ? 'truncate font-medium text-warning' : 'truncate text-fg'} title={value ?? undefined}>
              {value ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] text-fg-subtle">Eklenme {formatRelative(business.createdAt)}</p>
    </div>
  );
}

export default async function DuplicatesPage() {
  const pairs = await db().business.findMany({
    where: { duplicateOfId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { ...businessSelect, duplicateOf: { select: businessSelect } },
  });

  return (
    <>
      <div className="mb-2 text-[13px] text-fg-muted">
        <Link href="/businesses" className="hover:text-fg">
          İşletmeler
        </Link>
      </div>
      <PageHeader
        title="Olası eşleşmeler"
        description="Aynı ad ve şehirde olup ortak bir kimliği (kaynak kimliği, web sitesi + şube) olmayan kayıtlar. Otomatik birleştirilmezler; kararı siz verirsiniz."
      />
      {pairs.length === 0 ? (
        <Panel>
          <EmptyState icon={CopyCheck} title="İncelenecek eşleşme yok" description="Yeni içe aktarmalarda şüpheli kayıt olursa burada görünür." />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {pairs.map((pair) =>
            pair.duplicateOf ? (
              <Panel key={pair.id}>
                <div className="flex flex-col gap-5 px-4 py-4 md:flex-row">
                  <Facts title="Mevcut kayıt" business={pair.duplicateOf} compareTo={pair} />
                  <div className="hidden w-px bg-border md:block" aria-hidden />
                  <Facts title="Yeni gelen kayıt" business={pair} compareTo={pair.duplicateOf} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                  <p className="text-[12px] text-fg-muted">
                    Birleştirince yeni kaydın kaynakları, iletişim bilgileri, bulguları ve kampanyaları mevcut kayda taşınır; mevcut değerler korunur.
                  </p>
                  <DecisionButtons duplicateId={pair.id} name={pair.name} />
                </div>
              </Panel>
            ) : null,
          )}
        </div>
      )}
    </>
  );
}
