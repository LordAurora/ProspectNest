import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, ChevronLeft, ChevronRight, Mail, Phone, SearchX } from 'lucide-react';
import { z } from 'zod';
import { PRIORITIES, priorityLabel } from '@prospectnest/core';
import type { Prisma } from '@prospectnest/db';
import { db } from '@/lib/db';
import { cn } from '@/lib/cn';
import { formatNumber, formatRelative } from '@/lib/format';
import { priorityTone } from '@/lib/status';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader, Panel } from '@/components/ui/panel';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';

export const metadata: Metadata = { title: 'İşletmeler' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const filtersSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  campaign: z.uuid().optional().catch(undefined),
  city: z.string().trim().max(80).optional().catch(undefined),
  priority: z.enum(PRIORITIES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

type Filters = z.infer<typeof filtersSchema>;

function buildWhere(filters: Filters): Prisma.CampaignBusinessWhereInput {
  const where: Prisma.CampaignBusinessWhereInput = {};
  if (filters.campaign) where.campaignId = filters.campaign;
  if (filters.priority) where.priority = filters.priority;
  const business: Prisma.BusinessWhereInput = {};
  if (filters.city) business.city = filters.city;
  if (filters.q) {
    business.OR = [
      { name: { contains: filters.q, mode: 'insensitive' } },
      { domain: { contains: filters.q, mode: 'insensitive' } },
      { city: { contains: filters.q, mode: 'insensitive' } },
    ];
  }
  if (Object.keys(business).length > 0) where.business = business;
  return where;
}

function pageHref(filters: Filters, page: number) {
  const params = new URLSearchParams();
  for (const key of ['q', 'campaign', 'city', 'priority'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/businesses?${query}` : '/businesses';
}

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const filters = filtersSchema.parse(await searchParams);
  const where = buildWhere(filters);
  const hasFilters = Boolean(filters.q || filters.campaign || filters.city || filters.priority);

  const [total, rows, campaigns, cities] = await Promise.all([
    db().campaignBusiness.count({ where }),
    db().campaignBusiness.findMany({
      where,
      orderBy: [{ opportunityScore: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        priority: true,
        opportunityScore: true,
        campaign: { select: { name: true } },
        business: {
          select: {
            name: true,
            domain: true,
            city: true,
            district: true,
            category: true,
            lastCheckedAt: true,
            _count: { select: { evidence: { where: { observationStatus: 'present' } } } },
            contacts: { select: { kind: true } },
          },
        },
      },
    }),
    db().campaign.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db().business.findMany({
      where: { city: { not: null } },
      distinct: ['city'],
      select: { city: true },
      orderBy: { city: 'asc' },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstIndex = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const lastIndex = Math.min(filters.page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader title="İşletmeler" description="Kampanyalara eklenmiş işletmeler, bulguları ve öncelikleri." />

      <Panel>
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3" role="search">
          <label htmlFor="filter-q" className="sr-only">
            Ara
          </label>
          <Input
            id="filter-q"
            name="q"
            type="search"
            placeholder="Ad, domain veya şehir"
            defaultValue={filters.q}
            className="h-8 w-full sm:w-[240px]"
          />
          <label htmlFor="filter-campaign" className="sr-only">
            Kampanya
          </label>
          <Select id="filter-campaign" name="campaign" defaultValue={filters.campaign ?? ''} className="h-8 w-auto max-w-[220px]">
            <option value="">Tüm kampanyalar</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </Select>
          <label htmlFor="filter-city" className="sr-only">
            Şehir
          </label>
          <Select id="filter-city" name="city" defaultValue={filters.city ?? ''} className="h-8 w-auto">
            <option value="">Tüm şehirler</option>
            {cities.map(({ city }) =>
              city ? (
                <option key={city} value={city}>
                  {city}
                </option>
              ) : null,
            )}
          </Select>
          <label htmlFor="filter-priority" className="sr-only">
            Öncelik
          </label>
          <Select id="filter-priority" name="priority" defaultValue={filters.priority ?? ''} className="h-8 w-auto">
            <option value="">Tüm öncelikler</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabel[priority]}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonClass({ size: 'sm' })}>
            Filtrele
          </button>
          {hasFilters ? (
            <Link href="/businesses" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
              Temizle
            </Link>
          ) : null}
          <p className="ml-auto text-[13px] text-fg-muted tabular-nums" aria-live="polite">
            {formatNumber(total)} sonuç
          </p>
        </form>

        {rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="Filtrelerle eşleşen işletme yok"
              description="Aramayı genişletin veya filtreleri temizleyin."
              action={
                <Link href="/businesses" className={buttonClass({ size: 'sm' })}>
                  Filtreleri temizle
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={Building2}
              title="Henüz işletme yok"
              description="Bir kampanyaya CSV yükleyerek veya işletmeleri tek tek ekleyerek başlayın."
            />
          )
        ) : (
          <Table className="min-w-[860px]">
            <THead>
              <TH>İşletme</TH>
              <TH>Konum</TH>
              <TH>Kategori</TH>
              <TH>Öncelik</TH>
              <TH align="right">Puan</TH>
              <TH align="right">Kanıt</TH>
              <TH>İletişim</TH>
              <TH align="right">Son kontrol</TH>
            </THead>
            <tbody>
              {rows.map((row) => {
                const { business } = row;
                const hasEmail = business.contacts.some((c) => c.kind === 'email');
                const hasPhone = business.contacts.some((c) => c.kind === 'phone');
                return (
                  <TR key={row.id}>
                    <TD className="max-w-[320px]">
                      <p className="truncate font-medium text-fg" title={business.name}>
                        {business.name}
                      </p>
                      <p className="truncate text-[12px] text-fg-muted">
                        {business.domain ?? 'Web sitesi yok'}
                        {filters.campaign ? null : <span className="text-fg-subtle"> · {row.campaign.name}</span>}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">
                      {[business.district, business.city].filter(Boolean).join(', ') || '—'}
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">{business.category ?? '—'}</TD>
                    <TD>
                      <Badge tone={priorityTone[row.priority]}>{priorityLabel[row.priority]}</Badge>
                    </TD>
                    <TD align="right" numeric className="font-medium">
                      {row.opportunityScore ?? <span className="text-fg-subtle">—</span>}
                    </TD>
                    <TD align="right" numeric className="text-fg-muted">
                      {business._count.evidence}
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2 text-fg-subtle">
                        <Mail className={cn('size-4', hasEmail && 'text-fg')} aria-hidden />
                        <span className="sr-only">{hasEmail ? 'E-posta var' : 'E-posta yok'}</span>
                        <Phone className={cn('size-4', hasPhone && 'text-fg')} aria-hidden />
                        <span className="sr-only">{hasPhone ? 'Telefon var' : 'Telefon yok'}</span>
                      </span>
                    </TD>
                    <TD align="right" className="whitespace-nowrap text-fg-muted">
                      {business.lastCheckedAt ? formatRelative(business.lastCheckedAt) : 'Kontrol edilmedi'}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}

        {total > PAGE_SIZE ? (
          <nav
            aria-label="Sayfalama"
            className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[13px] text-fg-muted"
          >
            <span className="tabular-nums">
              {formatNumber(firstIndex)}–{formatNumber(lastIndex)} / {formatNumber(total)}
            </span>
            <div className="flex items-center gap-1">
              <PageLink href={pageHref(filters, filters.page - 1)} disabled={filters.page <= 1} label="Önceki sayfa">
                <ChevronLeft aria-hidden />
              </PageLink>
              <span className="px-2 tabular-nums">
                {filters.page} / {pageCount}
              </span>
              <PageLink href={pageHref(filters, filters.page + 1)} disabled={filters.page >= pageCount} label="Sonraki sayfa">
                <ChevronRight aria-hidden />
              </PageLink>
            </div>
          </nav>
        ) : null}
      </Panel>
    </>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = cn(buttonClass({ variant: 'ghost', size: 'sm' }), 'w-8 px-0');
  if (disabled) {
    return (
      <span className={cn(className, 'opacity-40')} aria-disabled="true" aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className} aria-label={label}>
      {children}
    </Link>
  );
}
