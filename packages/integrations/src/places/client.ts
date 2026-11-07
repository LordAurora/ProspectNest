/**
 * Google Places API (New) client.
 *
 * Text Search is called with the field mask `places.id,nextPageToken`, the
 * "ID Only" tier: discovery stores nothing but place IDs, which Google permits
 * to be kept indefinitely. Names, addresses, phones and websites are fetched
 * with Place Details only when a person looks at a result, and are never
 * written to the database or exported.
 */
const BASE = 'https://places.googleapis.com/v1';
const SEARCH_FIELD_MASK = 'places.id,nextPageToken';
export const DETAILS_FIELD_MASK = 'id,displayName,formattedAddress,googleMapsUri,websiteUri,nationalPhoneNumber,businessStatus';

/** Google returns at most 60 results across pages for one Text Search. */
export const MAX_TEXT_SEARCH_RESULTS = 60;
const PAGE_SIZE = 20;

export type PlacesErrorKind = 'not_configured' | 'credentials' | 'invalid_request' | 'quota' | 'rate_limited' | 'unavailable' | 'cancelled';

const messages: Record<PlacesErrorKind, string> = {
  not_configured: 'Google Places API anahtarı tanımlı değil.',
  credentials: 'Google Places isteği reddedildi. API anahtarını, Places API (New) erişimini ve faturalandırmayı kontrol edin.',
  invalid_request: 'Google Places sorguyu kabul etmedi. Şehir ve işletme türünü kontrol edin.',
  quota: 'Günlük Google Places istek sınırına ulaşıldı. Sınır yarın sıfırlanır.',
  rate_limited: 'Google Places kota sınırına ulaşıldı; kısa süre sonra yeniden deneyin.',
  unavailable: 'Google Places şu an yanıt vermiyor.',
  cancelled: 'Arama iptal edildi.',
};

export class PlacesError extends Error {
  constructor(readonly kind: PlacesErrorKind) {
    super(messages[kind]);
    this.name = 'PlacesError';
  }

  get retryable() {
    return this.kind === 'rate_limited' || this.kind === 'unavailable';
  }
}

export type PlacesFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

export type PlaceDetails = {
  id: string;
  name: string;
  address: string | null;
  mapsUrl: string | null;
  website: string | null;
  phone: string | null;
  businessStatus: string | null;
};

export type SearchQuery = { textQuery: string; languageCode?: string; regionCode?: string };

export type DiscoverOptions = {
  maxResults: number;
  signal?: AbortSignal;
  /** Called before every billable request; throw (e.g. PlacesError('quota')) to stop. */
  beforeRequest?: () => Promise<void>;
  /** Receives each page of place IDs as soon as it arrives. */
  onPage?: (placeIds: string[]) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
};

/** "Kafe Bartın Türkiye" style query; districts narrow it further. */
export function buildTextQuery(input: { category: string; city?: string | null; district?: string | null; country?: string | null }): string {
  return [input.category, input.district, input.city, input.country].map((part) => part?.trim()).filter(Boolean).join(' ');
}

export class PlacesClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: PlacesFetch = fetch as unknown as PlacesFetch,
    private readonly maxAttempts = 3,
  ) {
    if (!apiKey) throw new PlacesError('not_configured');
  }

  private async call(url: string, fieldMask: string, body: unknown | undefined, options: { signal?: AbortSignal; sleep: (ms: number) => Promise<void> }) {
    for (let attempt = 1; ; attempt += 1) {
      if (options.signal?.aborted) throw new PlacesError('cancelled');
      let status: number;
      let payload: unknown;
      try {
        const response = await this.fetcher(url, {
          method: body === undefined ? 'GET' : 'POST',
          // The key travels in a header, never in the URL, so it does not end up in logs.
          headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': fieldMask, 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          ...(options.signal ? { signal: options.signal } : {}),
        });
        status = response.status;
        payload = await response.json().catch(() => ({}));
      } catch {
        if (options.signal?.aborted) throw new PlacesError('cancelled');
        status = 503;
        payload = {};
      }

      if (status >= 200 && status < 300) return payload;
      const error =
        status === 400 ? new PlacesError('invalid_request') : status === 401 || status === 403 ? new PlacesError('credentials') : status === 429 ? new PlacesError('rate_limited') : new PlacesError('unavailable');
      if (!error.retryable || attempt >= this.maxAttempts) throw error;
      // Bounded exponential backoff with jitter.
      await options.sleep(Math.round(1_000 * 2 ** (attempt - 1) * (0.5 + Math.random() / 2)));
    }
  }

  /** Pages through Text Search until `maxResults` IDs (≤ 60) or no next page. Returns all IDs found. */
  async discover(query: SearchQuery, options: DiscoverOptions): Promise<string[]> {
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const limit = Math.min(Math.max(1, options.maxResults), MAX_TEXT_SEARCH_RESULTS);
    const ids: string[] = [];
    let pageToken: string | undefined;

    do {
      await options.beforeRequest?.();
      const body = (await this.call(
        `${BASE}/places:searchText`,
        SEARCH_FIELD_MASK,
        {
          textQuery: query.textQuery,
          languageCode: query.languageCode ?? 'tr',
          ...(query.regionCode ? { regionCode: query.regionCode } : {}),
          pageSize: Math.min(PAGE_SIZE, limit - ids.length),
          ...(pageToken ? { pageToken } : {}),
        },
        { ...(options.signal ? { signal: options.signal } : {}), sleep },
      )) as { places?: { id?: string }[]; nextPageToken?: string };

      const page = (body.places ?? []).map((p) => p.id).filter((id): id is string => typeof id === 'string').slice(0, limit - ids.length);
      ids.push(...page);
      if (page.length > 0) await options.onPage?.(page);
      pageToken = body.nextPageToken;
    } while (pageToken && ids.length < limit);

    return ids;
  }

  /** Live details for display only. The caller must not persist or export the result. */
  async details(placeId: string, options: { languageCode?: string; signal?: AbortSignal } = {}): Promise<PlaceDetails> {
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const body = (await this.call(
      `${BASE}/places/${encodeURIComponent(placeId)}?languageCode=${options.languageCode ?? 'tr'}`,
      DETAILS_FIELD_MASK,
      undefined,
      { ...(options.signal ? { signal: options.signal } : {}), sleep },
    )) as {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      googleMapsUri?: string;
      websiteUri?: string;
      nationalPhoneNumber?: string;
      businessStatus?: string;
    };
    return {
      id: body.id ?? placeId,
      name: body.displayName?.text ?? '(adsız)',
      address: body.formattedAddress ?? null,
      mapsUrl: body.googleMapsUri ?? null,
      website: body.websiteUri ?? null,
      phone: body.nationalPhoneNumber ?? null,
      businessStatus: body.businessStatus ?? null,
    };
  }
}
