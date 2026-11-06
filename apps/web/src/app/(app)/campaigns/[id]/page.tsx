import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Upload } from 'lucide-react';
import { z } from 'zod';
import {
  priorityLabel,
  ruleConditionLabel,
  ruleSetSchema,
  runStatusLabel,
  serviceTemplateLabel,
  signalLabel,
  PRIORITIES,
} from '@prospectnest/core';
import { resolveDiscoveryProvider } from '@prospectnest/providers';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber } from '@/lib/format';
import { runStatusTone } from '@/lib/status';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { PageHeader, Panel, PanelHeader } from '@/components/ui/panel';
import { StartResearchButton } from '@/components/run-actions';
import { ManualBusinessForm } from './manual-business-form';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

async function loadCampaign(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return db().campaign.findUnique({ where: { id } });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const campaign = await loadCampaign((await params).id);
  return { title: campaign?.name ?? 'Kampanya' };
}

const sourceLabel: Record<string, string> = { csv: 'CSV dosyası', manual: 'Manuel giriş', discovery: 'Canlı keşif' };

export default async function CampaignPage({ params }: Props) {
  const campaign = await loadCampaign((await params).id);
  if (!campaign || campaign.archivedAt) notFound();

  const [byPriority, imports, total, activeRun] = await Promise.all([
    db().campaignBusiness.groupBy({ by: ['priority'], where: { campaignId: campaign.id }, _count: true }),
    db().run.findMany({
      where: { campaignId: campaign.id, kind: 'import' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, status: true, newBusinesses: true, updatedBusinesses: true, failedItems: true, createdAt: true, summary: true },
    }),
    db().campaignBusiness.count({ where: { campaignId: campaign.id } }),
    db().run.findFirst({
      where: { campaignId: campaign.id, kind: { in: ['research', 'recheck', 'discovery'] }, status: { in: ['queued', 'running'] } },
      select: { id: true },
    }),
  ]);

  const ruleSet = ruleSetSchema.safeParse(campaign.rules);
  const discovery = resolveDiscoveryProvider(env().DISCOVERY_PROVIDER);
  const counts = Object.fromEntries(byPriority.map((row) => [row.priority, row._count]));

  return (
    <>
      <div className="mb-2 text-[13px] text-fg-muted">
        <Link href="/campaigns" className="hover:text-fg">
          Kampanyalar
        </Link>
      </div>
      <PageHeader
        title={campaign.name}
        description={`${serviceTemplateLabel[campaign.template]} · ${campaign.serviceDescription}`}
        action={
          <>
            <Link href={`/businesses?campaign=${campaign.id}`} className={buttonClass()}>
              İşletmeleri gör
            </Link>
            <Link href={`/campaigns/${campaign.id}/import`} className={buttonClass()}>
              <Upload aria-hidden />
              CSV içe aktar
            </Link>
            {activeRun ? (
              <Link href={`/runs/${activeRun.id}`} className={buttonClass({ variant: 'primary' })}>
                Süren çalışmayı aç
              </Link>
            ) : (
              <StartResearchButton campaignId={campaign.id} disabled={total === 0} />
            )}
          </>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border bg-border sm:grid-cols-5">
        <div className="bg-surface px-4 py-3">
          <dt className="text-[12px] text-fg-muted">Toplam işletme</dt>
          <dd className="mt-0.5 text-[18px] font-semibold tabular-nums">{formatNumber(total)}</dd>
        </div>
        {PRIORITIES.map((priority) => (
          <div key={priority} className="bg-surface px-4 py-3">
            <dt className="text-[12px] text-fg-muted">{priorityLabel[priority]}</dt>
            <dd className="mt-0.5 text-[18px] font-semibold tabular-nums">
              <Link href={`/businesses?campaign=${campaign.id}&priority=${priority}`} className="hover:text-accent">
                {formatNumber(counts[priority] ?? 0)}
              </Link>
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PanelHeader title="İşletme ekle" description="Tek bir işletmeyi elle ekleyin. Mevcut kayıtlarla otomatik eşleştirilir." />
            <ManualBusinessForm campaignId={campaign.id} />
          </Panel>

          <Panel>
            <PanelHeader title="Son içe aktarmalar" action={<SectionLink href="/runs">Tüm çalışmalar</SectionLink>} />
            {imports.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-fg-muted">Henüz içe aktarma yapılmadı.</p>
            ) : (
              <ul className="divide-y divide-border">
                {imports.map((run) => {
                  const fileName = (run.summary as { fileName?: string | null } | null)?.fileName;
                  return (
                    <li key={run.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
                      <Badge tone={runStatusTone[run.status]} dot>
                        {runStatusLabel[run.status]}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-fg">{fileName ?? 'Manuel kayıt'}</span>
                      <span className="text-fg-muted tabular-nums">
                        {formatNumber(run.newBusinesses)} yeni · {formatNumber(run.updatedBusinesses)} eşleşen
                        {run.failedItems > 0 ? <span className="text-warning"> · {formatNumber(run.failedItems)} hatalı</span> : null}
                      </span>
                      <span className="text-fg-subtle">{formatDateTime(run.createdAt)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Hedef ve program" />
            <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2.5 px-4 py-4 text-[13px]">
              <dt className="text-fg-muted">Bölge</dt>
              <dd>{[campaign.countries.join(', '), campaign.cities.join(', ') || 'Tüm şehirler'].join(' · ')}</dd>
              <dt className="text-fg-muted">Kategoriler</dt>
              <dd>{campaign.categories.join(', ') || '—'}</dd>
              <dt className="text-fg-muted">Kaynak</dt>
              <dd>
                {sourceLabel[campaign.source] ?? campaign.source}
                {campaign.source === 'discovery' && discovery.status !== 'ready' ? (
                  <span className="mt-0.5 block text-[12px] text-warning">Bağlantı gerekli</span>
                ) : null}
              </dd>
              <dt className="text-fg-muted">Günlük sınır</dt>
              <dd className="tabular-nums">
                {formatNumber(campaign.dailyNewLimit)} kayıt · {formatNumber(campaign.dailyPageBudget)} sayfa
              </dd>
              <dt className="text-fg-muted">Yeniden kontrol</dt>
              <dd>{campaign.recheckIntervalDays} günde bir</dd>
              <dt className="text-fg-muted">Saat dilimi</dt>
              <dd>{campaign.timezone}</dd>
            </dl>
          </Panel>

          <Panel>
            <PanelHeader title="Puanlama kuralları" description={`Sürüm ${campaign.ruleVersion}`} />
            {ruleSet.success ? (
              <ul className="divide-y divide-border text-[13px]">
                <li className="flex justify-between px-4 py-2.5 text-fg-muted">
                  Başlangıç puanı <span className="font-medium text-fg tabular-nums">{ruleSet.data.baseScore}</span>
                </li>
                {ruleSet.data.rules.map((rule) => (
                  <li key={rule.id} className={cn('flex items-start justify-between gap-3 px-4 py-2.5', !rule.enabled && 'opacity-50')}>
                    <span>
                      {signalLabel[rule.signal]} {ruleConditionLabel[rule.when]}
                      {!rule.enabled ? <span className="text-fg-subtle"> (kapalı)</span> : null}
                    </span>
                    <span className={cn('font-medium tabular-nums', rule.impact > 0 ? 'text-success' : rule.impact < 0 ? 'text-danger' : 'text-fg-muted')}>
                      {rule.impact > 0 ? `+${rule.impact}` : rule.impact}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-[13px] text-fg-muted">Bu kampanyada kural tanımlı değil; şablonun varsayılanları kullanılacak.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-fg">
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
