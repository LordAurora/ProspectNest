import { siteFixtures } from '@prospectnest/test-fixtures';
import { DEFAULT_RESEARCH_CONFIG, FetchError, researchWebsite, safeFetch, type Fetcher } from '@prospectnest/research';
import type { Researcher } from './jobs/research';

/**
 * In demo mode the reserved `.example` domains are answered from the local
 * synthetic site fixtures, so the full pipeline can be shown without touching
 * the internet. Real domains always go through the guarded fetcher.
 */
const demoFetcher: Fetcher = async (url, options) => {
  if (!new URL(url).hostname.endsWith('.example')) return safeFetch(url, options);
  const fixture = siteFixtures[url];
  if (!fixture) throw new FetchError('http_4xx', 'Sayfa açılamadı (404)', 404);
  if ('error' in fixture) throw new FetchError(fixture.error, 'Demo: simüle edilmiş hata');
  return { url, status: fixture.status ?? 200, contentType: 'text/html', body: fixture.html, fetchedAt: new Date() };
};

export function createResearcher({ demoMode }: { demoMode: boolean }): Researcher {
  const fetcher = demoMode ? demoFetcher : safeFetch;
  const config = demoMode ? { ...DEFAULT_RESEARCH_CONFIG, delayMs: 150 } : DEFAULT_RESEARCH_CONFIG;
  return (website) => researchWebsite(website, config, fetcher);
}
