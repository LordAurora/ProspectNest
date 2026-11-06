import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { runKindLabel, runStatusLabel } from '@prospectnest/core';
import { db } from '@/lib/db';
import { formatDateTime, formatNumber } from '@/lib/format';
import { runStatusTone } from '@/lib/status';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader, Panel } from '@/components/ui/panel';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Çalışmalar' };
export const dynamic = 'force-dynamic';

function duration(start: Date | null, end: Date | null): string {
  if (!start || !end) return '—';
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  return seconds < 60 ? `${seconds} sn` : `${Math.floor(seconds / 60)} dk ${seconds % 60} sn`;
}

export default async function RunsPage() {
  const runs = await db().run.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      kind: true,
      status: true,
      totalItems: true,
      doneItems: true,
      failedItems: true,
      newBusinesses: true,
      updatedBusinesses: true,
      error: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      campaign: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader title="Çalışmalar" description="İçe aktarma, araştırma ve aktarım işleri. İşler tarayıcı kapansa da worker üzerinde sürer." />
      <Panel>
        {runs.length === 0 ? (
          <EmptyState icon={Activity} title="Henüz çalışma yok" description="Bir kampanyada araştırma başlattığınızda burada görünür." />
        ) : (
          <Table className="min-w-[820px]">
            <THead>
              <TH>Çalışma</TH>
              <TH>Durum</TH>
              <TH align="right">Tamamlanan</TH>
              <TH align="right">Hata</TH>
              <TH align="right">Yeni / güncellenen</TH>
              <TH align="right">Süre</TH>
              <TH align="right">Oluşturulma</TH>
            </THead>
            <tbody>
              {runs.map((run) => (
                <TR key={run.id}>
                  <TD className="max-w-[300px]">
                    <Link href={`/runs/${run.id}`} className="font-medium text-fg hover:text-accent">
                      {runKindLabel[run.kind]}
                    </Link>
                    <p className="truncate text-[12px] text-fg-muted">{run.campaign.name}</p>
                  </TD>
                  <TD>
                    <Badge tone={runStatusTone[run.status]} dot>
                      {runStatusLabel[run.status]}
                    </Badge>
                    {run.error ? <p className="mt-1 max-w-[220px] truncate text-[12px] text-danger">{run.error}</p> : null}
                  </TD>
                  <TD align="right" numeric>
                    {formatNumber(run.doneItems)}
                    <span className="text-fg-subtle"> / {formatNumber(run.totalItems)}</span>
                  </TD>
                  <TD align="right" numeric className={run.failedItems > 0 ? 'text-warning' : 'text-fg-muted'}>
                    {formatNumber(run.failedItems)}
                  </TD>
                  <TD align="right" numeric className="text-fg-muted">
                    {formatNumber(run.newBusinesses)} / {formatNumber(run.updatedBusinesses)}
                  </TD>
                  <TD align="right" numeric className="whitespace-nowrap text-fg-muted">
                    {duration(run.startedAt, run.finishedAt)}
                  </TD>
                  <TD align="right" className="whitespace-nowrap text-fg-muted">
                    {formatDateTime(run.createdAt)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
