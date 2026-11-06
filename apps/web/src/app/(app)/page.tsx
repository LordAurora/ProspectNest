import Link from 'next/link';
import { ArrowRight, Check, CircleAlert, Info } from 'lucide-react';
import { priorityLabel, runKindLabel, runStatusLabel } from '@prospectnest/core';
import { db } from '@/lib/db';
import { formatNumber, formatRelative } from '@/lib/format';
import { priorityTone, runStatusTone } from '@/lib/status';
import { getIntegrationSummaries, getWorkerState } from '@/lib/system';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { PageHeader, Panel, PanelHeader } from '@/components/ui/panel';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

async function loadOverview() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [campaignCount, newLeads, researched, pendingRuns, lastSuccess, recentRuns, topLeads, partialRuns] =
    await Promise.all([
      db().campaign.count({ where: { archivedAt: null } }),
      db().campaignBusiness.count({ where: { firstSeenAt: { gte: since } } }),
      db().business.count({ where: { lastCheckedAt: { not: null } } }),
      db().run.count({ where: { status: { in: ['queued', 'running'] } } }),
      db().run.findFirst({
        where: { status: 'completed' },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true },
      }),
      db().run.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          kind: true,
          status: true,
          doneItems: true,
          totalItems: true,
          failedItems: true,
          createdAt: true,
          campaign: { select: { name: true } },
        },
      }),
      db().campaignBusiness.findMany({
        where: { priority: 'high' },
        orderBy: [{ opportunityScore: 'desc' }, { updatedAt: 'desc' }],
        take: 6,
        select: {
          id: true,
          priority: true,
          opportunityScore: true,
          business: { select: { name: true, domain: true, city: true } },
        },
      }),
      db().run.count({ where: { status: { in: ['partial', 'failed'] } } }),
    ]);
  return { campaignCount, newLeads, researched, pendingRuns, lastSuccess, recentRuns, topLeads, partialRuns };
}

export default async function OverviewPage() {
  const [data, worker] = await Promise.all([loadOverview(), getWorkerState()]);
  const integrations = getIntegrationSummaries();

  if (data.campaignCount === 0) return <GettingStarted />;

  const metrics = [
    { label: 'Yeni aday (7 gün)', value: formatNumber(data.newLeads) },
    { label: 'Araştırılan işletme', value: formatNumber(data.researched) },
    { label: 'Bekleyen çalışma', value: formatNumber(data.pendingRuns) },
    {
      label: 'Son başarılı çalışma',
      value: data.lastSuccess?.finishedAt ? formatRelative(data.lastSuccess.finishedAt) : '—',
    },
  ];

  const attention: { tone: 'danger' | 'warning' | 'neutral'; text: string; href: string }[] = [];
  if (worker.status !== 'online') {
    attention.push({
      tone: worker.status === 'stale' ? 'danger' : 'warning',
      text:
        worker.status === 'stale'
          ? `Worker ${formatRelative(worker.lastBeatAt)} beri yanıt vermiyor; arka plan işleri durdu.`
          : 'Worker hiç başlatılmadı. Araştırma işleri sırada bekler.',
      href: '/integrations',
    });
  }
  if (data.partialRuns > 0) {
    attention.push({
      tone: 'warning',
      text: `${formatNumber(data.partialRuns)} çalışma kısmi veya başarısız bitti.`,
      href: '/runs',
    });
  }
  for (const integration of integrations) {
    if (integration.state === 'not_configured') {
      attention.push({ tone: 'neutral', text: `${integration.name} bağlı değil.`, href: '/integrations' });
    }
  }

  return (
    <>
      <PageHeader title="Genel bakış" description="Kampanyalarınızdaki son durum ve dikkat gerektiren işler." />

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border bg-border lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-surface px-4 py-3.5">
            <dt className="text-[12px] text-fg-muted">{metric.label}</dt>
            <dd className="mt-1 text-[20px] font-semibold text-fg tabular-nums">{metric.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PanelHeader
              title="Öncelikli işletmeler"
              description="Yüksek öncelikli, kanıtı olan adaylar"
              action={<SectionLink href="/businesses?priority=high">Tümü</SectionLink>}
            />
            {data.topLeads.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-fg-muted">Henüz yüksek öncelikli işletme yok.</p>
            ) : (
              <Table>
                <THead>
                  <TH>İşletme</TH>
                  <TH>Şehir</TH>
                  <TH align="right">Puan</TH>
                  <TH>Öncelik</TH>
                </THead>
                <tbody>
                  {data.topLeads.map((lead) => (
                    <TR key={lead.id}>
                      <TD>
                        <p className="max-w-[320px] truncate font-medium text-fg">{lead.business.name}</p>
                        {lead.business.domain ? (
                          <p className="truncate text-[12px] text-fg-muted">{lead.business.domain}</p>
                        ) : null}
                      </TD>
                      <TD className="text-fg-muted">{lead.business.city ?? '—'}</TD>
                      <TD align="right" numeric className="font-medium">
                        {lead.opportunityScore ?? '—'}
                      </TD>
                      <TD>
                        <Badge tone={priorityTone[lead.priority]}>{priorityLabel[lead.priority]}</Badge>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Son çalışmalar" action={<SectionLink href="/runs">Tümü</SectionLink>} />
            {data.recentRuns.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-fg-muted">Henüz çalışma başlatılmadı.</p>
            ) : (
              <Table>
                <THead>
                  <TH>Çalışma</TH>
                  <TH>Durum</TH>
                  <TH align="right">İlerleme</TH>
                  <TH align="right">Başlangıç</TH>
                </THead>
                <tbody>
                  {data.recentRuns.map((run) => (
                    <TR key={run.id}>
                      <TD>
                        <p className="font-medium text-fg">{runKindLabel[run.kind]}</p>
                        <p className="max-w-[280px] truncate text-[12px] text-fg-muted">{run.campaign.name}</p>
                      </TD>
                      <TD>
                        <Badge tone={runStatusTone[run.status]} dot>
                          {runStatusLabel[run.status]}
                        </Badge>
                      </TD>
                      <TD align="right" numeric className="text-fg-muted">
                        {run.doneItems}/{run.totalItems}
                        {run.failedItems > 0 ? <span className="text-warning"> · {run.failedItems} hata</span> : null}
                      </TD>
                      <TD align="right" className="whitespace-nowrap text-fg-muted">
                        {formatRelative(run.createdAt)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>

        <Panel className="self-start">
          <PanelHeader title="İşlem gerektirenler" />
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-fg-muted">
              <Check className="size-4 text-success" aria-hidden />
              Bekleyen bir işlem yok.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {attention.map((item) => (
                <li key={item.text}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-2.5 px-4 py-3 text-[13px] text-fg transition-colors duration-150 hover:bg-surface-hover"
                  >
                    {item.tone === 'neutral' ? (
                      <Info className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                    ) : (
                      <CircleAlert
                        className={cn('mt-0.5 size-4 shrink-0', item.tone === 'danger' ? 'text-danger' : 'text-warning')}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1">{item.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-fg-muted transition-colors duration-150 hover:text-fg"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

const steps = [
  { title: 'Kampanya oluştur', body: 'Hizmetinizi, hedef şehirleri ve işletme türlerini tanımlayın.' },
  { title: 'İşletmeleri ekle', body: 'İzinli bir CSV yükleyin veya işletmeleri tek tek girin.' },
  { title: 'Araştırmayı başlat', body: 'Web siteleri incelenir, bulgular kanıtıyla kaydedilir ve puanlanır.' },
];

function GettingStarted() {
  return (
    <>
      <PageHeader
        title="Genel bakış"
        description="Başlamak için üç adım yeterli."
        action={
          <Link href="/campaigns/new" className={buttonClass({ variant: 'primary' })}>
            Kampanya oluştur
          </Link>
        }
      />
      <Panel className="max-w-3xl">
        <ol className="divide-y divide-border">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4 px-5 py-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-strong text-[13px] font-semibold text-fg-muted tabular-nums">
                {index + 1}
              </span>
              <div>
                <p className="font-medium text-fg">{step.title}</p>
                <p className="mt-0.5 text-[13px] text-fg-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="border-t border-border px-5 py-3 text-[12px] text-fg-muted">
          Örnek verilerle denemek için <code className="font-mono">pnpm db:seed</code> komutu sentetik ve etiketli bir demo
          kampanyası yükler.
        </p>
      </Panel>
    </>
  );
}
