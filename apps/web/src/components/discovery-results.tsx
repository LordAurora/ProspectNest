import Link from 'next/link';
import { ExternalLink, Globe, MapPin, Phone } from 'lucide-react';
import { PlacesClient, PlacesError, type PlaceDetails } from '@prospectnest/integrations';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { formatNumber } from '@/lib/format';
import { safeHref } from '@/lib/leads';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { PlacesTermsNote } from './places-terms-note';

const PAGE_SIZE = 20;

type Row = { placeId: string; details?: PlaceDetails; error?: string };

/**
 * Lists a discovery run. Only place IDs come from our database; everything a
 * person reads here is fetched live from Google for this view and is not
 * stored. Details are loaded only after the run finished, one page at a time,
 * to keep billable Place Details calls proportional to what is viewed.
 */
export async function DiscoveryResults({ runId, active, page }: { runId: string; active: boolean; page: number }) {
  const total = await db().discoveredPlace.count({ where: { runId } });
  const places = await db().discoveredPlace.findMany({
    where: { runId },
    orderBy: { position: 'asc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { placeId: true },
  });
  const key = env().GOOGLE_PLACES_API_KEY;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  let rows: Row[] = places.map((p) => ({ placeId: p.placeId }));
  if (!active && key && places.length > 0) {
    const client = new PlacesClient(key);
    const settled = await Promise.allSettled(places.map((p) => client.details(p.placeId)));
    rows = settled.map((result, i) =>
      result.status === 'fulfilled'
        ? { placeId: places[i]!.placeId, details: result.value }
        : { placeId: places[i]!.placeId, error: result.reason instanceof PlacesError ? result.reason.message : 'Ayrıntılar alınamadı.' },
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="Bulunan işletmeler"
        description={active ? 'Arama sürüyor; ayrıntılar arama bitince gösterilir.' : `${formatNumber(total)} sonuç · Kaynak: Google Maps`}
      />
      {total === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-fg-muted">{active ? 'Henüz sonuç yok.' : 'Bu arama için Google Places sonuç döndürmedi. Sorguyu genişletmeyi deneyin.'}</p>
      ) : active ? (
        <p className="px-4 py-6 text-[13px] text-fg-muted tabular-nums">{formatNumber(total)} işletme bulundu.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.placeId} className="flex flex-col gap-1.5 px-4 py-3 text-[13px] sm:flex-row sm:items-start sm:justify-between">
              {row.details ? (
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-fg">{row.details.name}</p>
                    {row.details.businessStatus && row.details.businessStatus !== 'OPERATIONAL' ? (
                      <Badge tone="warning">{row.details.businessStatus === 'CLOSED_PERMANENTLY' ? 'Kalıcı olarak kapalı' : 'Geçici olarak kapalı'}</Badge>
                    ) : null}
                  </div>
                  {row.details.address ? (
                    <p className="mt-0.5 flex items-start gap-1.5 text-fg-muted">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {row.details.address}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-fg-muted">
                    {safeHref(row.details.website) ? (
                      <a href={safeHref(row.details.website)!} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-accent">
                        <Globe className="size-3.5" aria-hidden />
                        Web sitesi
                      </a>
                    ) : (
                      <span className="text-fg-subtle">Web sitesi yok</span>
                    )}
                    {row.details.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3.5" aria-hidden />
                        {row.details.phone}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="min-w-0 text-fg-muted">
                  <p className="font-mono text-[12px]">{row.placeId}</p>
                  <p className="text-[12px]">{row.error ?? (key ? 'Ayrıntılar yükleniyor.' : 'Ayrıntılar için API anahtarı gerekli.')}</p>
                </div>
              )}
              {row.details?.mapsUrl ? (
                <a href={row.details.mapsUrl} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: 'sm', variant: 'ghost' })}>
                  Google Maps&apos;te aç
                  <ExternalLink aria-hidden />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!active && total > PAGE_SIZE ? (
        <nav aria-label="Sayfalama" className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[13px] text-fg-muted">
          <span className="tabular-nums">
            {page} / {pageCount}
          </span>
          <div className="flex gap-1">
            {page > 1 ? (
              <Link href={`/runs/${runId}?page=${page - 1}`} className={buttonClass({ size: 'sm', variant: 'ghost' })}>
                Önceki
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link href={`/runs/${runId}?page=${page + 1}`} className={buttonClass({ size: 'sm', variant: 'ghost' })}>
                Sonraki
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
      {/* Attribution required by the Google Maps Platform policies when showing Places content. */}
      <p className="border-t border-border px-4 py-2 text-right text-[12px] font-medium text-fg-muted">Google Maps</p>
      <PlacesTermsNote />
    </Panel>
  );
}
