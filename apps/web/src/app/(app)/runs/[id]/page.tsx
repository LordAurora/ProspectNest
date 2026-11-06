import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { runItemStatusLabel, runKindLabel, runStatusLabel } from '@prospectnest/core';
import { db } from '@/lib/db';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { isActiveRun, runItemStatusTone, runStatusTone } from '@/lib/status';
import { getWorkerState } from '@/lib/system';
import { AutoRefresh, CancelRunButton, RetryRunButton } from '@/components/run-actions';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Panel, PanelHeader } from '@/components/ui/panel';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Çalışma' };
export const dynamic = 'force-dynamic';

type ImportSummary = {
  fileName?: string | null;
  counters?: Record<string, number>;
  errors?: { row: number; errors: string[] }[];
};

const counterLabel: Record<string, string> = {
  created: 'Yeni işletme',
  matched: 'Mevcut kayıtla eşleşen',
  linked: 'Kampanyaya eklenen',
  alreadyInCampaign: 'Zaten kampanyada',
  repeatedInFile: 'Dosyada tekrar eden',
  possibleDuplicates: 'Olası eşleşme (inceleme bekliyor)',
  invalid: 'Hatalı satır',
};

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [run, worker] = await Promise.all([
    db().run.findUnique({
      where: { id },
      include: {
        campaign: { select: { id: true, name: true } },
        items: {
          orderBy: { updatedAt: 'desc' },
          take: 200,
          select: { id: true, status: true, attempts: true, error: true, pagesFetched: true, updatedAt: true, businessId: true },
        },
      },
    }),
    getWorkerState(),
  ]);
  if (!run) notFound();

  const businessIds = run.items.flatMap((i) => (i.businessId ? [i.businessId] : []));
  const businesses = await db().business.findMany({
    where: { id: { in: businessIds } },
    select: { id: true, name: true, domain: true },
  });
  const businessById = new Map(businesses.map((b) => [b.id, b]));

  const order: Record<string, number> = { failed: 0, blocked: 1, running: 2, pending: 3, skipped: 4, done: 5 };
  const items = [...run.items].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  const active = isActiveRun(run.status);
  const remaining = Math.max(0, run.totalItems - run.doneItems - run.failedItems);
  const percent = run.totalItems > 0 ? Math.round(((run.doneItems + run.failedItems) / run.totalItems) * 100) : 0;
  const summary = (run.summary ?? null) as ImportSummary | null;
  const canRetry = (run.kind === 'research' || run.kind === 'recheck') && (run.status === 'partial' || run.status === 'failed');

  return (
    <>
      <AutoRefresh active={active} />
      <div className="mb-2 text-[13px] text-fg-muted">
        <Link href="/runs" className="hover:text-fg">
          Çalışmalar
        </Link>
      </div>
      <PageHeader
        title={`${runKindLabel[run.kind]} çalışması`}
        description={`${run.campaign.name} · ${formatDateTime(run.createdAt)}`}
        action={active ? <CancelRunButton runId={run.id} /> : canRetry ? <RetryRunButton runId={run.id} /> : null}
      />

      <Panel className="mb-6">
        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <Badge tone={runStatusTone[run.status]} dot>
            {runStatusLabel[run.status]}
          </Badge>
          {run.cancelRequested && active ? <span className="text-[13px] text-fg-muted">İptal isteniyor; güvenli noktada duracak.</span> : null}
          {run.status === 'queued' && worker.status !== 'online' ? (
            <span className="text-[13px] text-warning">Worker çalışmıyor; iş sırada bekliyor.</span>
          ) : null}
          <span className="ml-auto text-[13px] text-fg-muted tabular-nums">
            {formatNumber(run.doneItems + run.failedItems)} / {formatNumber(run.totalItems)} · %{percent}
          </span>
        </div>
        <div className="px-4 pb-4">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="İlerleme"
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
          {[
            ['Tamamlanan', run.doneItems],
            ['Hatalı / engellenen', run.failedItems],
            ['Kalan', remaining],
            ['Yeni / güncellenen işletme', `${formatNumber(run.newBusinesses)} / ${formatNumber(run.updatedBusinesses)}`],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-surface px-4 py-3">
              <dt className="text-[12px] text-fg-muted">{label}</dt>
              <dd className="mt-0.5 text-[16px] font-semibold tabular-nums">{typeof value === 'number' ? formatNumber(value) : value}</dd>
            </div>
          ))}
        </dl>
        {run.error ? <p className="border-t border-border px-4 py-3 text-[13px] text-fg">{run.error}</p> : null}
      </Panel>

      {summary?.counters ? (
        <Panel className="mb-6">
          <PanelHeader title="İçe aktarma raporu" description={summary.fileName ?? undefined} />
          <dl className="grid max-w-lg grid-cols-[1fr_auto] gap-x-6 gap-y-2 px-4 py-4 text-[13px]">
            {Object.entries(summary.counters).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-fg-muted">{counterLabel[key] ?? key}</dt>
                <dd className="text-right font-medium tabular-nums">{formatNumber(value)}</dd>
              </div>
            ))}
          </dl>
          {summary.errors && summary.errors.length > 0 ? (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto border-t border-border text-[13px]">
              {summary.errors.map((error) => (
                <li key={error.row} className="flex gap-3 px-4 py-2">
                  <span className="w-16 shrink-0 text-fg-muted tabular-nums">Satır {error.row}</span>
                  <span>{error.errors.join(' · ')}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : null}

      {items.length > 0 ? (
        <Panel>
          <PanelHeader title="İşletmeler" description="Hatalar ve engellenen siteler önce listelenir." />
          <Table className="min-w-[720px]">
            <THead>
              <TH>İşletme</TH>
              <TH>Durum</TH>
              <TH>Açıklama</TH>
              <TH align="right">Sayfa</TH>
              <TH align="right">Deneme</TH>
              <TH align="right">Güncelleme</TH>
            </THead>
            <tbody>
              {items.map((item) => {
                const business = item.businessId ? businessById.get(item.businessId) : undefined;
                return (
                  <TR key={item.id}>
                    <TD className="max-w-[280px]">
                      <p className="truncate font-medium">{business?.name ?? 'Silinmiş işletme'}</p>
                      {business?.domain ? <p className="truncate text-[12px] text-fg-muted">{business.domain}</p> : null}
                    </TD>
                    <TD>
                      <Badge tone={runItemStatusTone[item.status]}>{runItemStatusLabel[item.status]}</Badge>
                    </TD>
                    <TD className="max-w-[320px] text-[13px] text-fg-muted">
                      <span className="line-clamp-2">{item.error ?? '—'}</span>
                    </TD>
                    <TD align="right" numeric className="text-fg-muted">
                      {item.pagesFetched}
                    </TD>
                    <TD align="right" numeric className="text-fg-muted">
                      {item.attempts}
                    </TD>
                    <TD align="right" className="whitespace-nowrap text-fg-muted">
                      {formatRelative(item.updatedAt)}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Panel>
      ) : null}
    </>
  );
}
