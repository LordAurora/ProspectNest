import { z } from 'zod';
import { SIGNALS, type ObservationStatus, type Signal } from '@prospectnest/core';
import { extractPage, type PageExtraction } from './extract';
import { isPathAllowed, parseRobots, type RobotsRules } from './robots';
import { FetchError, safeFetch, validateTargetUrl, type FetchOptions, type FetchedPage } from './safe-fetch';

export type ResearchConfig = {
  maxPages: number;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  userAgent: string;
  /** Pause between requests to the same site. */
  delayMs: number;
};

export const DEFAULT_RESEARCH_CONFIG: ResearchConfig = {
  maxPages: 5,
  timeoutMs: 12_000,
  maxBytes: 1_500_000,
  maxRedirects: 5,
  userAgent: 'ProspectNestBot/0.1 (+business research; respects robots.txt)',
  delayMs: 1_000,
};

export type Fetcher = (url: string, options: FetchOptions) => Promise<FetchedPage>;

export type Observation = {
  signal: Signal;
  status: ObservationStatus;
  sourceUrl: string;
  excerpt: string | null;
  contentHash: string | null;
  fetchedAt: Date;
};

export type FoundContact = { kind: 'email' | 'phone'; value: string; sourceUrl: string };

export type ResearchOutcome = {
  status: 'ok' | 'unreachable' | 'blocked' | 'robots_disallowed' | 'social_only' | 'no_website';
  observations: Observation[];
  contacts: FoundContact[];
  pagesFetched: number;
  error?: { kind: string; message: string };
};

const SOCIAL_HOSTS = /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|linktr\.ee|x\.com|twitter\.com|youtube\.com)$/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Signals the HTML extractor can observe on a page; the rest are decided at site level. */
const PAGE_SIGNALS = SIGNALS.filter((s) => s !== 'website_present' && s !== 'social_only');

async function loadRobots(origin: string, fetcher: Fetcher, config: ResearchConfig): Promise<RobotsRules | null> {
  try {
    const page = await fetcher(`${origin}/robots.txt`, { ...config, maxBytes: 200_000, accept: 'text' });
    return parseRobots(page.body, 'ProspectNestBot');
  } catch (error) {
    // Missing robots.txt means no restrictions; an unreachable host surfaces on the homepage fetch.
    if (error instanceof FetchError && error.kind === 'http_4xx') return null;
    return null;
  }
}

/**
 * Inspects up to `maxPages` pages of a business website and turns them into
 * observations. A page that could not be read never becomes negative evidence:
 * signals are `not_observed` only when at least one page was actually inspected.
 *
 * Retryable homepage failures throw FetchError so the caller can back off.
 */
export async function researchWebsite(
  website: string | null,
  config: ResearchConfig = DEFAULT_RESEARCH_CONFIG,
  fetcher: Fetcher = safeFetch,
): Promise<ResearchOutcome> {
  const now = () => new Date();
  if (!website) return { status: 'no_website', observations: [], contacts: [], pagesFetched: 0 };

  let start: URL;
  try {
    start = validateTargetUrl(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Geçersiz adres';
    return { status: 'unreachable', observations: [], contacts: [], pagesFetched: 0, error: { kind: 'invalid_url', message } };
  }

  // Social profiles are not crawled (login walls, platform terms); the URL itself is the observation.
  if (SOCIAL_HOSTS.test(start.hostname)) {
    const at = now();
    return {
      status: 'social_only',
      pagesFetched: 0,
      contacts: [],
      observations: [
        { signal: 'social_only', status: 'present', sourceUrl: start.toString(), excerpt: 'Web sitesi olarak sosyal medya profili verilmiş', contentHash: null, fetchedAt: at },
        { signal: 'website_present', status: 'not_observed', sourceUrl: start.toString(), excerpt: null, contentHash: null, fetchedAt: at },
      ],
    };
  }

  const robots = await loadRobots(start.origin, fetcher, config);
  if (robots && !isPathAllowed(robots, start.pathname || '/')) {
    return {
      status: 'robots_disallowed',
      observations: [],
      contacts: [],
      pagesFetched: 0,
      error: { kind: 'robots_disallowed', message: 'Site erişim kuralları incelemeye izin vermiyor' },
    };
  }

  const pages: { page: FetchedPage; extraction: PageExtraction }[] = [];
  const queue: string[] = [start.toString()];
  const visited = new Set<string>();
  let pagesFetched = 0;
  let homepageError: FetchError | null = null;

  while (queue.length > 0 && pagesFetched < config.maxPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    if (robots && !isPathAllowed(robots, new URL(url).pathname)) continue;
    if (pagesFetched > 0) await sleep(config.delayMs);

    pagesFetched += 1;
    try {
      const page = await fetcher(url, config);
      const extraction = extractPage(page.body, page.url);
      if (extraction.blocked) {
        if (pages.length === 0) {
          return {
            status: 'blocked',
            observations: [],
            contacts: [],
            pagesFetched,
            error: { kind: 'blocked', message: 'Site doğrulama veya giriş istiyor; atlatma yapılmadı' },
          };
        }
        continue;
      }
      pages.push({ page, extraction });
      for (const link of extraction.links) if (!visited.has(link) && !queue.includes(link)) queue.push(link);
    } catch (error) {
      if (pages.length === 0 && url === start.toString()) {
        homepageError = error instanceof FetchError ? error : new FetchError('network', 'Siteye bağlanılamadı');
        break;
      }
    }
  }

  if (pages.length === 0) {
    if (homepageError?.retryable) throw homepageError;
    return {
      status: 'unreachable',
      observations: [],
      contacts: [],
      pagesFetched,
      error: { kind: homepageError?.kind ?? 'network', message: homepageError?.message ?? 'Siteye ulaşılamadı' },
    };
  }

  // A digital menu link only counts once it actually loads.
  const candidates = pages.flatMap(({ page, extraction }) => extraction.digitalMenuCandidates.map((c) => ({ ...c, from: page.url })));
  let verifiedMenu: { url: string; excerpt: string; fetchedAt: Date } | null = null;
  for (const candidate of candidates.slice(0, 2)) {
    if (pagesFetched >= config.maxPages + 2) break;
    pagesFetched += 1;
    try {
      const page = await fetcher(candidate.url, config);
      verifiedMenu = { url: page.url, excerpt: candidate.excerpt, fetchedAt: page.fetchedAt };
      break;
    } catch {
      // An unverifiable link is neither proof of a working menu nor of its absence.
    }
  }

  const home = pages[0]!;
  const observations: Observation[] = [
    {
      signal: 'website_present',
      status: 'present',
      sourceUrl: home.page.url,
      excerpt: null,
      contentHash: home.extraction.contentHash,
      fetchedAt: home.page.fetchedAt,
    },
    { signal: 'social_only', status: 'not_observed', sourceUrl: home.page.url, excerpt: null, contentHash: null, fetchedAt: home.page.fetchedAt },
  ];

  for (const signal of PAGE_SIGNALS) {
    if (signal === 'digital_menu_link') {
      if (verifiedMenu) {
        observations.push({ signal, status: 'present', sourceUrl: verifiedMenu.url, excerpt: verifiedMenu.excerpt, contentHash: null, fetchedAt: verifiedMenu.fetchedAt });
      } else if (candidates.length > 0) {
        observations.push({ signal, status: 'unknown', sourceUrl: candidates[0]!.url, excerpt: 'Bağlantı bulundu ancak açılamadı', contentHash: null, fetchedAt: now() });
      } else {
        observations.push({ signal, status: 'not_observed', sourceUrl: home.page.url, excerpt: null, contentHash: null, fetchedAt: home.page.fetchedAt });
      }
      continue;
    }
    const hit = pages.find(({ extraction }) => extraction.signals.some((s) => s.signal === signal));
    if (hit) {
      const found = hit.extraction.signals.find((s) => s.signal === signal)!;
      observations.push({
        signal,
        status: 'present',
        sourceUrl: found.url ?? hit.page.url,
        excerpt: found.excerpt,
        contentHash: hit.extraction.contentHash,
        fetchedAt: hit.page.fetchedAt,
      });
    } else {
      observations.push({ signal, status: 'not_observed', sourceUrl: home.page.url, excerpt: null, contentHash: null, fetchedAt: home.page.fetchedAt });
    }
  }

  const contacts: FoundContact[] = [];
  const seenContacts = new Set<string>();
  for (const { page, extraction } of pages) {
    for (const value of extraction.emails) {
      if (!seenContacts.has(`e:${value}`) && z.email().safeParse(value).success) {
        seenContacts.add(`e:${value}`);
        contacts.push({ kind: 'email', value, sourceUrl: page.url });
      }
    }
    for (const value of extraction.phones) {
      if (!seenContacts.has(`p:${value}`)) {
        seenContacts.add(`p:${value}`);
        contacts.push({ kind: 'phone', value, sourceUrl: page.url });
      }
    }
  }

  return { status: 'ok', observations, contacts, pagesFetched };
}
