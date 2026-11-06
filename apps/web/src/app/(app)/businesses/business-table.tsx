'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Phone, Play, X } from 'lucide-react';
import { LEAD_STATUSES, leadStatusLabel, priorityLabel, type LeadStatus, type Priority } from '@prospectnest/core';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { priorityTone } from '@/lib/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { bulkResearch, bulkUpdateStatus } from './actions';

export type BusinessRow = {
  id: string;
  priority: Priority;
  status: LeadStatus;
  score: number | null;
  campaignName: string;
  name: string;
  domain: string | null;
  location: string;
  category: string | null;
  lastCheckedAt: Date | null;
  evidenceCount: number;
  hasEmail: boolean;
  hasPhone: boolean;
  possibleDuplicate: boolean;
  viewHref: string;
};

export function BusinessTable({ rows, singleCampaign }: { rows: BusinessRow[]; singleCampaign: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>('reviewing');
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = (task: () => Promise<{ error?: string; message?: string; runId?: string }>) =>
    startTransition(async () => {
      const result = await task();
      if (result.error) return setFeedback({ tone: 'error', text: result.error });
      setFeedback({ tone: 'ok', text: result.message ?? 'Tamamlandı.' });
      setSelected(new Set());
      if (result.runId) router.push(`/runs/${result.runId}`);
      else router.refresh();
    });

  return (
    <>
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft px-3 py-2 text-[13px]" role="toolbar" aria-label="Toplu işlemler">
          <span className="font-medium text-fg tabular-nums">{selected.size} seçili</span>
          <Button
            size="sm"
            variant="primary"
            disabled={!singleCampaign}
            loading={pending}
            title={singleCampaign ? undefined : 'Önce tek bir kampanya filtreleyin'}
            onClick={() => run(() => bulkResearch([...selected]))}
          >
            <Play aria-hidden />
            Seçilenleri araştır
          </Button>
          <label htmlFor="bulk-status" className="sr-only">
            Yeni takip durumu
          </label>
          <Select id="bulk-status" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as LeadStatus)} className="h-8 w-auto text-[13px]">
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {leadStatusLabel[status]}
              </option>
            ))}
          </Select>
          <Button size="sm" disabled={pending} onClick={() => run(() => bulkUpdateStatus([...selected], bulkStatus))}>
            Durumu uygula
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X aria-hidden />
            Seçimi temizle
          </Button>
          {!singleCampaign ? <span className="text-[12px] text-fg-muted">Toplu araştırma için tek kampanya seçin.</span> : null}
        </div>
      ) : null}
      {feedback ? (
        <p role="status" className={cn('border-b border-border px-4 py-2 text-[13px]', feedback.tone === 'error' ? 'text-danger' : 'text-fg-muted')}>
          {feedback.text}
        </p>
      ) : null}

      <Table className="md:min-w-[920px]">
        <THead>
          <TH className="w-10 pr-0">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
              aria-label="Bu sayfadaki tümünü seç"
              className="size-4 accent-[var(--accent)]"
            />
          </TH>
          <TH>İşletme</TH>
          <TH className="hidden md:table-cell">Konum</TH>
          <TH className="hidden lg:table-cell">Kategori</TH>
          <TH>Öncelik</TH>
          <TH align="right">Puan</TH>
          <TH align="right" className="hidden md:table-cell">
            Kanıt
          </TH>
          <TH className="hidden md:table-cell">İletişim</TH>
          <TH className="hidden lg:table-cell">Takip</TH>
          <TH align="right" className="hidden xl:table-cell">
            Son kontrol
          </TH>
        </THead>
        <tbody>
          {rows.map((row) => (
            <TR key={row.id} className={cn(selected.has(row.id) && 'bg-accent-soft/50')}>
              <TD className="w-10 pr-0">
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                  aria-label={`${row.name} seç`}
                  className="size-4 accent-[var(--accent)]"
                />
              </TD>
              <TD className="max-w-[200px] sm:max-w-[320px]">
                <div className="flex min-w-0 items-center gap-2">
                  <Link href={row.viewHref} scroll={false} className="truncate font-medium text-fg hover:text-accent" title={row.name}>
                    {row.name}
                  </Link>
                  {row.possibleDuplicate ? (
                    <Badge tone="warning" className="hidden shrink-0 sm:inline-flex">
                      Olası eşleşme
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate text-[12px] text-fg-muted">
                  {row.domain ?? 'Web sitesi yok'}
                  {singleCampaign ? null : <span className="text-fg-subtle"> · {row.campaignName}</span>}
                </p>
              </TD>
              <TD className="hidden whitespace-nowrap text-fg-muted md:table-cell">{row.location || '—'}</TD>
              <TD className="hidden whitespace-nowrap text-fg-muted lg:table-cell">{row.category ?? '—'}</TD>
              <TD>
                <Badge tone={priorityTone[row.priority]}>{priorityLabel[row.priority]}</Badge>
              </TD>
              <TD align="right" numeric className="font-medium">
                {row.score ?? <span className="text-fg-subtle">—</span>}
              </TD>
              <TD align="right" numeric className="hidden md:table-cell">
                <Link href={`${row.viewHref}#kanit`} scroll={false} className="text-fg-muted hover:text-accent" aria-label={`${row.evidenceCount} bulgu, kanıtları aç`}>
                  {row.evidenceCount}
                </Link>
              </TD>
              <TD className="hidden md:table-cell">
                <span className="flex items-center gap-2 text-fg-subtle">
                  <Mail className={cn('size-4', row.hasEmail && 'text-fg')} aria-hidden />
                  <span className="sr-only">{row.hasEmail ? 'E-posta var' : 'E-posta yok'}</span>
                  <Phone className={cn('size-4', row.hasPhone && 'text-fg')} aria-hidden />
                  <span className="sr-only">{row.hasPhone ? 'Telefon var' : 'Telefon yok'}</span>
                </span>
              </TD>
              <TD className="hidden whitespace-nowrap text-[13px] text-fg-muted lg:table-cell">{leadStatusLabel[row.status]}</TD>
              <TD align="right" className="hidden whitespace-nowrap text-fg-muted xl:table-cell">
                {row.lastCheckedAt ? formatRelative(row.lastCheckedAt) : 'Kontrol edilmedi'}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}
