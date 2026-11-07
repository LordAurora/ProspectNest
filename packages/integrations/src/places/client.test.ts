import { describe, expect, it, vi } from 'vitest';
import { buildTextQuery, PlacesClient, PlacesError, type PlacesFetch } from './client';

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> | null };

function fakeGoogle(responses: { status: number; body?: unknown }[]) {
  const calls: Call[] = [];
  const fetcher: PlacesFetch = vi.fn(async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body ? (JSON.parse(init.body) as Record<string, unknown>) : null });
    const next = responses.shift() ?? { status: 500 };
    return { status: next.status, json: async () => next.body ?? {} };
  });
  return { fetcher, calls };
}

const page = (prefix: string, count: number, nextPageToken?: string) => ({
  status: 200,
  body: { places: Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}` })), ...(nextPageToken ? { nextPageToken } : {}) },
});

const noSleep = async () => undefined;

describe('PlacesClient.discover', () => {
  it('requests only place IDs, keeps the key in a header and follows pages', async () => {
    const { fetcher, calls } = fakeGoogle([page('a', 20, 't1'), page('b', 20, 't2'), page('c', 5)]);
    const pages: string[][] = [];
    const ids = await new PlacesClient('secret-key', fetcher).discover(
      { textQuery: 'Kafe Bartın Türkiye', regionCode: 'TR' },
      { maxResults: 60, sleep: noSleep, onPage: async (p) => void pages.push(p) },
    );

    expect(ids).toHaveLength(45);
    expect(pages.map((p) => p.length)).toEqual([20, 20, 5]);
    expect(calls[0]?.url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(calls[0]?.url).not.toContain('secret-key');
    expect(calls[0]?.headers).toMatchObject({ 'X-Goog-Api-Key': 'secret-key', 'X-Goog-FieldMask': 'places.id,nextPageToken' });
    expect(calls[0]?.body).toMatchObject({ textQuery: 'Kafe Bartın Türkiye', languageCode: 'tr', regionCode: 'TR', pageSize: 20 });
    expect(calls[1]?.body).toMatchObject({ pageToken: 't1' });
  });

  it('stops at the requested limit', async () => {
    const { fetcher, calls } = fakeGoogle([page('a', 20, 't1'), page('b', 5, 't2')]);
    const ids = await new PlacesClient('k', fetcher).discover({ textQuery: 'q' }, { maxResults: 25, sleep: noSleep });
    expect(ids).toHaveLength(25);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).toMatchObject({ pageSize: 5 });
  });

  it('retries rate limits and server errors a bounded number of times', async () => {
    const { fetcher, calls } = fakeGoogle([{ status: 429 }, { status: 503 }, page('a', 3)]);
    await expect(new PlacesClient('k', fetcher).discover({ textQuery: 'q' }, { maxResults: 20, sleep: noSleep })).resolves.toHaveLength(3);
    expect(calls).toHaveLength(3);

    const failing = fakeGoogle([{ status: 429 }, { status: 429 }, { status: 429 }, page('x', 1)]);
    await expect(new PlacesClient('k', failing.fetcher).discover({ textQuery: 'q' }, { maxResults: 20, sleep: noSleep })).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(failing.calls).toHaveLength(3);
  });

  it('does not retry rejected credentials', async () => {
    const { fetcher, calls } = fakeGoogle([{ status: 403, body: { error: { status: 'PERMISSION_DENIED' } } }]);
    await expect(new PlacesClient('k', fetcher).discover({ textQuery: 'q' }, { maxResults: 20, sleep: noSleep })).rejects.toMatchObject({ kind: 'credentials' });
    expect(calls).toHaveLength(1);
  });

  it('honours the quota hook and cancellation between pages', async () => {
    const quota = fakeGoogle([page('a', 20, 't1'), page('b', 20)]);
    let requests = 0;
    const beforeRequest = async () => {
      requests += 1;
      if (requests > 1) throw new PlacesError('quota');
    };
    await expect(new PlacesClient('k', quota.fetcher).discover({ textQuery: 'q' }, { maxResults: 60, sleep: noSleep, beforeRequest })).rejects.toMatchObject({ kind: 'quota' });
    expect(quota.calls).toHaveLength(1);

    const controller = new AbortController();
    const cancel = fakeGoogle([page('a', 20, 't1'), page('b', 20)]);
    await expect(
      new PlacesClient('k', cancel.fetcher).discover({ textQuery: 'q' }, { maxResults: 60, sleep: noSleep, signal: controller.signal, onPage: async () => controller.abort() }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(cancel.calls).toHaveLength(1);
  });

  it('refuses to run without a key', () => {
    expect(() => new PlacesClient('')).toThrow(PlacesError);
  });
});

describe('PlacesClient.details', () => {
  it('maps live fields without inventing an e-mail', async () => {
    const { fetcher, calls } = fakeGoogle([
      {
        status: 200,
        body: { id: 'p1', displayName: { text: 'Liman Kafe' }, formattedAddress: 'Bartın', googleMapsUri: 'https://maps.google.com/?cid=1', nationalPhoneNumber: '0378 000 00 00' },
      },
    ]);
    const details = await new PlacesClient('k', fetcher).details('p1');
    expect(details).toEqual({ id: 'p1', name: 'Liman Kafe', address: 'Bartın', mapsUrl: 'https://maps.google.com/?cid=1', website: null, phone: '0378 000 00 00', businessStatus: null });
    expect(details).not.toHaveProperty('email');
    expect(calls[0]?.url).toBe('https://places.googleapis.com/v1/places/p1?languageCode=tr');
  });
});

describe('buildTextQuery', () => {
  it('joins category, district, city and country', () => {
    expect(buildTextQuery({ category: 'Kafeler', city: 'Bartın', country: 'Türkiye' })).toBe('Kafeler Bartın Türkiye');
    expect(buildTextQuery({ category: 'Kafe', district: 'Amasra', city: 'Bartın', country: null })).toBe('Kafe Amasra Bartın');
  });
});
