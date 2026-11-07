import { describe, expect, it } from 'vitest';
import { siteFixtures } from '@prospectnest/test-fixtures';
import { isBlockedAddress, isBlockedHostname } from './net-guard';
import { DEFAULT_RESEARCH_CONFIG, researchWebsite, type Fetcher } from './researcher';
import { isPathAllowed, parseRobots } from './robots';
import { FetchError, validateTargetUrl } from './safe-fetch';

const fixtureFetcher: Fetcher = async (url) => {
  const fixture = siteFixtures[url];
  if (!fixture) throw new FetchError('http_4xx', 'Sayfa açılamadı (404)', 404);
  if ('error' in fixture) throw new FetchError(fixture.error, fixture.error);
  return { url, status: fixture.status ?? 200, contentType: 'text/html', body: fixture.html, fetchedAt: new Date() };
};

const config = { ...DEFAULT_RESEARCH_CONFIG, delayMs: 0 };
const research = (url: string) => researchWebsite(url, config, fixtureFetcher);
const statusOf = (outcome: Awaited<ReturnType<typeof research>>, signal: string) =>
  outcome.observations.find((o) => o.signal === signal)?.status;

describe('researchWebsite', () => {
  it('finds a PDF menu and public contacts across linked pages', async () => {
    const outcome = await research('https://lavanta-kahve.example/');
    expect(outcome.status).toBe('ok');
    expect(statusOf(outcome, 'pdf_or_image_menu')).toBe('present');
    expect(statusOf(outcome, 'digital_menu_link')).toBe('not_observed');
    const pdf = outcome.observations.find((o) => o.signal === 'pdf_or_image_menu');
    expect(pdf?.sourceUrl).toBe('https://lavanta-kahve.example/files/lavanta-menu-2026.pdf');
    expect(outcome.contacts).toEqual(
      expect.arrayContaining([
        { kind: 'email', value: 'merhaba@lavanta-kahve.example', sourceUrl: 'https://lavanta-kahve.example/iletisim' },
        expect.objectContaining({ kind: 'phone', value: '+902160000001' }),
      ]),
    );
    // Image file names that look like e-mails are not contacts; no address is guessed.
    expect(outcome.contacts.some((c) => c.value.includes('logo'))).toBe(false);
    expect(outcome.contacts.some((c) => c.value.startsWith('info@'))).toBe(false);
  });

  it('counts a digital menu only after the link loads', async () => {
    const outcome = await research('https://simitkosesi.example/');
    expect(statusOf(outcome, 'digital_menu_link')).toBe('present');
    expect(statusOf(outcome, 'whatsapp_contact')).toBe('present');
  });

  it('keeps an unverifiable digital menu link unknown', async () => {
    const fetcher: Fetcher = async (url, options) => {
      if (url.includes('qrmenu')) throw new FetchError('network', 'down');
      return fixtureFetcher(url, options);
    };
    const outcome = await researchWebsite('https://simitkosesi.example/', config, fetcher);
    expect(statusOf(outcome, 'digital_menu_link')).toBe('unknown');
  });

  it('detects menu-by-phone wording with a real excerpt', async () => {
    const outcome = await research('https://bademli.example/');
    const observation = outcome.observations.find((o) => o.signal === 'menu_by_phone_request');
    expect(observation?.status).toBe('present');
    expect(observation?.excerpt).toContain('menüsünü öğrenmek için bizi arayın');
  });

  it('keeps headings out of excerpts', async () => {
    const outcome = await research('https://egesofrasi.example/');
    const observation = outcome.observations.find((o) => o.signal === 'menu_by_phone_request');
    expect(observation?.excerpt).toBe('Güncel menü için WhatsApp hattımızdan yazabilirsiniz');
  });

  it('reports not_observed for a reachable page without evidence', async () => {
    const outcome = await research('https://ankaburger.example/');
    expect(outcome.status).toBe('ok');
    expect(statusOf(outcome, 'pdf_or_image_menu')).toBe('not_observed');
    expect(statusOf(outcome, 'website_present')).toBe('present');
  });

  it('marks bot challenges as blocked without negative evidence', async () => {
    const outcome = await research('https://galatatatli.example/');
    expect(outcome.status).toBe('blocked');
    expect(outcome.observations).toHaveLength(0);
  });

  it('throws retryable errors for timeouts so the worker can back off', async () => {
    await expect(research('https://kordonpide.example/')).rejects.toMatchObject({ kind: 'timeout', retryable: true });
  });

  it('does not crawl social profiles', async () => {
    const outcome = await research('https://instagram.com/somecafe');
    expect(outcome.status).toBe('social_only');
    expect(outcome.pagesFetched).toBe(0);
    expect(statusOf(outcome, 'social_only')).toBe('present');
  });
});

describe('SSRF guards', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1'])(
    'blocks %s',
    (address) => expect(isBlockedAddress(address)).toBe(true),
  );

  it.each(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111'])('allows public %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('rejects local hostnames, credentials, odd ports and non-http schemes', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedHostname('printer.local')).toBe(true);
    expect(isBlockedHostname('intranet')).toBe(true);
    for (const url of ['http://127.0.0.1/', 'http://[::1]/', 'file:///etc/passwd', 'http://user:pw@example.com/', 'http://example.com:6379/', 'http://169.254.169.254/latest/meta-data']) {
      expect(() => validateTargetUrl(url)).toThrow(FetchError);
    }
    expect(validateTargetUrl('https://example.com/menu#x').toString()).toBe('https://example.com/menu');
  });
});

describe('robots.txt', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /admin\nAllow: /admin/public\n\nUser-agent: OtherBot\nDisallow: /', 'ProspectNestBot');
  it('applies the longest matching rule', () => {
    expect(isPathAllowed(rules, '/')).toBe(true);
    expect(isPathAllowed(rules, '/admin/settings')).toBe(false);
    expect(isPathAllowed(rules, '/admin/public/menu')).toBe(true);
  });
  it('honours a group addressed to our agent', () => {
    const own = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: ProspectNestBot\nDisallow: /', 'ProspectNestBot');
    expect(isPathAllowed(own, '/')).toBe(false);
  });
});
