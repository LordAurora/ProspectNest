import Link from 'next/link';
import { Bot, ExternalLink, Mail, Phone, TriangleAlert } from 'lucide-react';
import {
  observationStatusLabel,
  priorityLabel,
  ruleConditionLabel,
  runItemStatusLabel,
  signalLabel,
  type ObservationStatus,
  type RuleResult,
  type Signal,
} from '@prospectnest/core';
import { cn } from '@/lib/cn';
import { env } from '@/lib/env';
import { formatDateTime, formatRelative } from '@/lib/format';
import { safeHref, type LeadDetailData } from '@/lib/leads';
import { priorityTone, runItemStatusTone } from '@/lib/status';
import { Badge, type Tone } from '@/components/ui/badge';
import { LeadNotes, LeadStatusSelect } from './lead-controls';

const observationTone: Record<ObservationStatus, Tone> = { present: 'accent', not_observed: 'neutral', unknown: 'warning' };
const EXCERPT_PREVIEW = 120;

const isSignal = (value: string): value is Signal => value in signalLabel;
const labelFor = (signal: string) => (isSignal(signal) ? signalLabel[signal] : signal);

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border px-5 py-4 first:border-t-0">
      <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
      {description ? <p className="mt-0.5 text-[12px] text-fg-muted">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SourceLink({ url }: { url: string }) {
  const href = safeHref(url.startsWith('kaynak-kaydi') ? null : url);
  if (!href) return <span className="text-fg-subtle">Kaynak kayıt</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 text-fg-muted hover:text-accent">
      <span className="truncate">{new URL(href).hostname + new URL(href).pathname.replace(/\/$/, '')}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">(yeni sekmede açılır)</span>
    </a>
  );
}

function Excerpt({ text }: { text: string }) {
  if (text.length <= EXCERPT_PREVIEW) return <q className="text-fg">{text}</q>;
  return (
    <details>
      <summary className="cursor-pointer text-fg">
        <q>{text.slice(0, EXCERPT_PREVIEW)}…</q>
      </summary>
      <q className="mt-1 block text-fg">{text}</q>
    </details>
  );
}

function ruleSentence(result: RuleResult): string {
  const label = signalLabel[result.signal];
  if (result.status === 'unknown') return `${label}: değerlendirilemedi`;
  return `${label} ${ruleConditionLabel[result.when]}`;
}

/** Shared by the full page and the quick-view drawer. */
export function LeadDetail({ lead }: { lead: LeadDetailData }) {
  const { business, campaign } = lead;
  const website = safeHref(business.website);
  const latest = lead.evaluations[0];
  const results = (latest?.results ?? []) as RuleResult[];
  const aiMode = env().AI_MODE;
  const analysis = lead.analyses[0];

  const timeline = [
    ...business.sources.map((s) => ({ at: s.firstSeenAt, text: `${s.provider === 'csv' ? 'CSV' : s.provider === 'manual' ? 'Manuel kayıt' : s.provider === 'demo' ? 'Demo verisi' : s.provider} ile eklendi` })),
    ...lead.runItems.map((item) => ({ at: item.updatedAt, text: `Araştırma: ${runItemStatusLabel[item.status]}${item.error ? ` — ${item.error}` : ''}`, tone: runItemStatusTone[item.status], href: `/runs/${item.runId}` })),
    ...lead.evaluations.map((e) => ({ at: e.createdAt, text: `Puan ${e.score} · ${priorityLabel[e.priority]} (kural sürümü ${e.ruleVersion})` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <article>
      <header className="px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={priorityTone[lead.priority]}>{priorityLabel[lead.priority]}</Badge>
          {campaign.isDemo ? <Badge tone="warning">Demo</Badge> : null}
          {business.duplicateOf ? <Badge tone="warning">Olası eşleşme</Badge> : null}
        </div>
        <h1 className="mt-2 text-[20px] leading-7 font-semibold break-words text-fg">{business.name}</h1>
        <p className="mt-0.5 text-[13px] text-fg-muted">
          {[business.category, [business.district, business.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Konum bilinmiyor'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <LeadStatusSelect leadId={lead.id} status={lead.status} />
          {website ? (
            <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-accent">
              Siteyi aç
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : (
            <span className="text-[13px] text-fg-subtle">Kayıtta web sitesi yok</span>
          )}
        </div>
        {business.duplicateOf ? (
          <p className="mt-3 flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-[12px] text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Aynı ad ve şehirde başka bir kayıt var ({business.duplicateOf.name}). Ortak bir kimlik bulunmadığı için birleştirilmedi.
          </p>
        ) : null}
      </header>

      <Section title="İletişim" description="Yalnız açık kaynaklarda görülen adresler. E-posta sözdizimi geçerli; teslim edilebilirlik doğrulanmadı.">
        {business.contacts.length === 0 ? (
          <p className="text-[13px] text-fg-muted">İncelenen sayfalarda iletişim bilgisi bulunamadı.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-[13px]">
            {business.contacts.map((contact) => (
              <li key={contact.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {contact.kind === 'email' ? <Mail className="size-4 text-fg-subtle" aria-hidden /> : <Phone className="size-4 text-fg-subtle" aria-hidden />}
                <a href={`${contact.kind === 'email' ? 'mailto' : 'tel'}:${contact.value}`} className="font-medium text-fg hover:text-accent">
                  {contact.value}
                </a>
                <span className="flex min-w-0 items-center gap-1 text-[12px] text-fg-subtle">
                  {contact.sourceUrl ? <SourceLink url={contact.sourceUrl} /> : 'Kaynak kayıt'} · {formatRelative(contact.seenAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Kural değerlendirmesi" description="Puan bulgulardan türetilen bir öncelik ipucudur; satın alma olasılığı değildir.">
        {latest ? (
          <>
            <dl className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-control border border-border bg-border text-center">
              {[
                ['Puan', String(latest.score)],
                ['Kanıt kapsamı', `%${Math.round(latest.evidenceCoverage * 100)}`],
                ['İletişim', `${latest.contactability}/2`],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface px-2 py-2">
                  <dt className="text-[11px] text-fg-muted">{label}</dt>
                  <dd className="text-[16px] font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {results.map((result) => (
                <li key={result.ruleId} className="flex items-start justify-between gap-3">
                  <span className={cn(result.fired ? 'text-fg' : 'text-fg-muted')}>
                    {ruleSentence(result)}
                    {!result.fired && result.status !== 'unknown' ? <span className="text-fg-subtle"> — koşul oluşmadı</span> : null}
                  </span>
                  <span className={cn('shrink-0 font-medium tabular-nums', result.impact > 0 ? 'text-success' : result.impact < 0 ? 'text-danger' : 'text-fg-subtle')}>
                    {result.fired ? (result.impact > 0 ? `+${result.impact}` : result.impact) : '0'}
                  </span>
                </li>
              ))}
            </ul>
            {lead.priority === 'not_evaluated' ? (
              <p className="mt-3 text-[12px] text-warning">Kanıt kapsamı yetersiz; puan saklandı ancak öncelik verilmedi.</p>
            ) : null}
            <p className="mt-3 text-[12px] text-fg-subtle">
              Kural sürümü {latest.ruleVersion} · {formatDateTime(latest.createdAt)}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-fg-muted">Henüz değerlendirilmedi. Araştırma tamamlandığında kurallar uygulanır.</p>
        )}
      </Section>

      <Section id="kanit" title="Gözlenen bulgular" description="“Bulunamadı” yalnız incelenen sayfaları ifade eder; erişilemeyen sayfa olumsuz kanıt sayılmaz.">
        {business.evidence.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Henüz bulgu yok.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-[13px]">
            {business.evidence.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-fg">{labelFor(item.signal)}</span>
                  <Badge tone={observationTone[item.observationStatus]}>{observationStatusLabel[item.observationStatus]}</Badge>
                </div>
                {item.excerpt ? <Excerpt text={item.excerpt} /> : null}
                <span className="flex min-w-0 items-center gap-1 text-[12px] text-fg-subtle">
                  <SourceLink url={item.sourceUrl} /> · {formatDateTime(item.fetchedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Yerel AI yorumu" description="Kural sonucundan ayrıdır ve puanı değiştirmez.">
        <p className="flex items-center gap-2 text-[13px] text-fg-muted">
          <Bot className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          {aiMode === 'disabled'
            ? 'Yerel model kapalı. Kural değerlendirmesi modelden bağımsız çalışır.'
            : analysis
              ? `Son analiz: ${analysis.status} · ${formatRelative(analysis.createdAt)}`
              : 'Yerel analiz bekliyor.'}
        </p>
      </Section>

      <Section title="Notlar" description="Uygulama içi notlar. Google Sheets'teki kullanıcı sütunlarından ayrı tutulur.">
        <LeadNotes leadId={lead.id} notes={lead.notes} />
      </Section>

      <Section title="Zaman çizelgesi">
        <ol className="flex flex-col gap-2 text-[13px]">
          {timeline.map((event, index) => (
            <li key={index} className="flex gap-3">
              <span className="w-24 shrink-0 text-[12px] text-fg-subtle tabular-nums">{formatRelative(event.at)}</span>
              {'href' in event && event.href ? (
                <Link href={event.href} className="min-w-0 text-fg hover:text-accent">
                  {event.text}
                </Link>
              ) : (
                <span className="min-w-0 text-fg">{event.text}</span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[12px] text-fg-subtle">
          Son doğrulama: {business.lastCheckedAt ? formatDateTime(business.lastCheckedAt) : 'henüz yok'} · Kampanya:{' '}
          <Link href={`/campaigns/${campaign.id}`} className="hover:text-accent">
            {campaign.name}
          </Link>
        </p>
      </Section>
    </article>
  );
}
