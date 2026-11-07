import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, ChevronLeft, ChevronRight, FileSpreadsheet, SearchX } from 'lucide-react';
import { z } from 'zod';
import { LEAD_STATUSES, PRIORITIES, leadStatusLabel, priorityLabel } from '@prospectnest/core';
import type { Prisma } from '@prospectnest/db';
import { db } from '@/lib/db';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { loadLead } from '@/lib/leads';
import { LeadDetail } from '@/components/lead/lead-detail';
import { buttonClass } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader, Panel } from '@/components/ui/panel';
import { BusinessTable, type BusinessRow } from './business-table';

export const metadata: Metadata = { title: 'İşletmeler' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const FILTER_KEYS = ['q', 'campaign', 'city', 'priority', 'status'] as const;

const filtersSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  campaign: z.uuid().optional().catch(undefined),
  city: z.string().trim().max(80).optional().catch(undefined),
  priority: z.enum(PRIORITIES).optional().catch(undefined),
  status: z.enum(LEAD_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
  view: z.uuid().optional().catch(undefined),
});

type Filters = z.infer<typeof filtersSchema>;

function buildWhere(filters: Filters): Prisma.CampaignBusinessWhereInput {
  const where: Prisma.CampaignBusinessWhereInput = {};
  if (filters.campaign) where.campaignId = filters.campaign;
  if (filters.priority) where.priority = filters.priority;
  if (filters.status) where.status = filters.status;
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

function href(filters: Filters, overrides: { page?: number; view?: string | null } = {}) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const page = overrides.page ?? filters.page;
  if (page > 1) params.set('page', String(page));
  const view = overrides.view === undefined ? filters.view : overrides.view;
  if (view) params.set('view', view);
  const query = params.toString();
  return query ? `/businesses?${query}` : '/businesses';
}

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const filters = filtersSchema.parse(await searchParams);
  const where = buildWhere(filters);
  const hasFilters = FILTER_KEYS.some((key) => key !== 'campaign' && filters[key]) || Boolean(filters.campaign);

  const [total, leads, campaigns, cities, viewed] = await Promise.all([
    db().campaignBusiness.count({ where }),
    db().campaignBusiness.findMany({
      where,
      orderBy: [{ opportunityScore: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        priority: true,
        status: true,
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
            duplicateOfId: true,
            _count: { select: { evidence: { where: { observationStatus: 'present' } } } },
            contacts: { select: { kind: true } },
          },
        },
      },
    }),
    db().campaign.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db().business.findMany({ where: { city: { not: null } }, distinct: ['city'], select: { city: true }, orderBy: { city: 'asc' } }),
    filters.view ? loadLead(filters.view) : null,
  ]);

  const rows: BusinessRow[] = leads.map(({ business, ...lead }) => ({
    id: lead.id,
    priority: lead.priority,
    status: lead.status,
    score: lead.opportunityScore,
    campaignName: lead.campaign.name,
    name: business.name,
    domain: business.domain,
    location: [business.district, business.city].filter(Boolean).join(', '),
    category: business.category,
    lastCheckedAt: business.lastCheckedAt,
    evidenceCount: business._count.evidence,
    hasEmail: business.contacts.some((c) => c.kind === 'email'),
    hasPhone: business.contacts.some((c) => c.kind === 'phone'),
    possibleDuplicate: Boolean(business.duplicateOfId),
    viewHref: href(filters, { view: lead.id }),
  }));

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstIndex = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const lastIndex = Math.min(filters.page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        title="İşletmeler"
        description="Kampanyalara eklenmiş işletmeler, bulguları ve öncelikleri."
        action={
          filters.campaign ? (
            <a
              href={`/api/campaigns/${filters.campaign}/export?${new URLSearchParams({
                format: 'xlsx',
                ...(filters.priority ? { priority: filters.priority } : {}),
                ...(filters.status ? { status: filters.status } : {}),
              }).toString()}`}
              className={buttonClass()}
              download
            >
              <FileSpreadsheet aria-hidden />
              Excel olarak indir
            </a>
          ) : null
        }
      />

      <Panel>
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3" role="search">
          <label htmlFor="filter-q" className="sr-only">
            Ara
          </label>
          <Input id="filter-q" name="q" type="search" placeholder="Ad, domain veya şehir" defaultValue={filters.q} className="h-8 w-full sm:w-[220px]" />
          <FilterSelect id="campaign" label="Kampanya" value={filters.campaign} all="Tüm kampanyalar" options={campaigns.map((c) => [c.id, c.name])} />
          <FilterSelect id="city" label="Şehir" value={filters.city} all="Tüm şehirler" options={cities.flatMap(({ city }) => (city ? [[city, city] as const] : []))} />
          <FilterSelect id="priority" label="Öncelik" value={filters.priority} all="Tüm öncelikler" options={PRIORITIES.map((p) => [p, priorityLabel[p]])} />
          <FilterSelect id="status" label="Takip durumu" value={filters.status} all="Tüm durumlar" options={LEAD_STATUSES.map((s) => [s, leadStatusLabel[s]])} />
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
              action={
                <Link href="/campaigns" className={buttonClass({ size: 'sm' })}>
                  Kampanyalara git
                </Link>
              }
            />
          )
        ) : (
          <BusinessTable rows={rows} singleCampaign={Boolean(filters.campaign)} />
        )}

        {total > PAGE_SIZE ? (
          <nav aria-label="Sayfalama" className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[13px] text-fg-muted">
            <span className="tabular-nums">
              {formatNumber(firstIndex)}–{formatNumber(lastIndex)} / {formatNumber(total)}
            </span>
            <div className="flex items-center gap-1">
              <PageLink href={href(filters, { page: filters.page - 1, view: null })} disabled={filters.page <= 1} label="Önceki sayfa">
                <ChevronLeft aria-hidden />
              </PageLink>
              <span className="px-2 tabular-nums">
                {filters.page} / {pageCount}
              </span>
              <PageLink href={href(filters, { page: filters.page + 1, view: null })} disabled={filters.page >= pageCount} label="Sonraki sayfa">
                <ChevronRight aria-hidden />
              </PageLink>
            </div>
          </nav>
        ) : null}
      </Panel>

      {viewed ? (
        <Drawer label={viewed.business.name} closeHref={href(filters, { view: null })} fullHref={`/businesses/${viewed.id}`}>
          <LeadDetail lead={viewed} />
        </Drawer>
      ) : null}
    </>
  );
}

function FilterSelect({
  id,
  label,
  value,
  all,
  options,
}: {
  id: string;
  label: string;
  value: string | undefined;
  all: string;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <>
      <label htmlFor={`filter-${id}`} className="sr-only">
        {label}
      </label>
      <Select id={`filter-${id}`} name={id} defaultValue={value ?? ''} className="h-8 w-[calc(50%-4px)] sm:w-auto sm:max-w-[200px]">
        <option value="">{all}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </Select>
    </>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
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
