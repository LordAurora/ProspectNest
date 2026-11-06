import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { Agent, fetch, type Response } from 'undici';
import { isBlockedAddress, isBlockedHostname } from './net-guard';

export type FetchErrorKind =
  | 'invalid_url'
  | 'blocked_address'
  | 'timeout'
  | 'network'
  | 'http_4xx'
  | 'http_5xx'
  | 'rate_limited'
  | 'too_large'
  | 'not_html'
  | 'too_many_redirects'
  | 'robots_disallowed';

export class FetchError extends Error {
  constructor(
    readonly kind: FetchErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FetchError';
  }

  /** Transient failures worth retrying with backoff. */
  get retryable(): boolean {
    return this.kind === 'timeout' || this.kind === 'network' || this.kind === 'http_5xx' || this.kind === 'rate_limited';
  }
}

export type FetchOptions = {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  userAgent: string;
  accept?: 'html' | 'text';
};

export type FetchedPage = {
  url: string;
  status: number;
  contentType: string;
  body: string;
  fetchedAt: Date;
};

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * Resolves the hostname and rejects private targets *at connect time*: the
 * socket connects to exactly the address validated here, so a DNS answer that
 * changes between check and use (rebinding) cannot reach an internal host.
 */
function guardedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    const list = addresses as LookupAddress[];
    const blocked = list.find((entry) => isBlockedAddress(entry.address));
    if (blocked || list.length === 0) {
      const err = Object.assign(new Error(`Engellenen adres: ${hostname}`), { code: 'EBLOCKED' }) as NodeJS.ErrnoException;
      return callback(err, []);
    }
    if (options.all) return callback(null, list);
    const first = list[0]!;
    callback(null, first.address, first.family);
  });
}

const agent = new Agent({
  connect: { lookup: guardedLookup as never, timeout: 10_000 },
  keepAliveTimeout: 4_000,
  connections: 32,
});

export function validateTargetUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new FetchError('invalid_url', 'Geçersiz adres');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('invalid_url', 'Yalnızca http/https desteklenir');
  if (url.username || url.password) throw new FetchError('invalid_url', 'Kimlik bilgisi içeren adresler desteklenmez');
  if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) throw new FetchError('blocked_address', 'Standart dışı port');
  if (isBlockedHostname(url.hostname)) throw new FetchError('blocked_address', 'Yerel veya özel ağ adresi');
  url.hash = '';
  return url;
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new FetchError('too_large', 'Yanıt boyutu sınırı aşıyor');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchError('too_large', 'Yanıt boyutu sınırı aşıyor');
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);
  const charset = /charset=([\w-]+)/i.exec(response.headers.get('content-type') ?? '')?.[1]?.toLowerCase();
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

/** GET with SSRF guards, manual redirect validation, timeout and a hard body-size cap. */
export async function safeFetch(input: string, options: FetchOptions): Promise<FetchedPage> {
  let url = validateTargetUrl(input);
  const signal = AbortSignal.timeout(options.timeoutMs);

  for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        dispatcher: agent,
        redirect: 'manual',
        signal,
        headers: {
          'user-agent': options.userAgent,
          accept: options.accept === 'text' ? 'text/plain,*/*;q=0.5' : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'accept-language': 'tr,en;q=0.8',
        },
      });
    } catch (error) {
      if (signal.aborted) throw new FetchError('timeout', 'Zaman aşımı');
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code === 'EBLOCKED') throw new FetchError('blocked_address', 'Yerel veya özel ağ adresine yönlendirme engellendi');
      throw new FetchError('network', 'Siteye bağlanılamadı');
    }

    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      await response.body?.cancel();
      url = validateTargetUrl(new URL(response.headers.get('location')!, url).toString());
      continue;
    }
    if (response.status === 429) throw new FetchError('rate_limited', 'Site istek sınırına ulaştı', 429);
    if (response.status >= 500) throw new FetchError('http_5xx', `Sunucu hatası (${response.status})`, response.status);
    if (response.status >= 400) throw new FetchError('http_4xx', `Sayfa açılamadı (${response.status})`, response.status);

    const contentType = response.headers.get('content-type') ?? '';
    const expectsHtml = options.accept !== 'text';
    if (expectsHtml && contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      await response.body?.cancel();
      throw new FetchError('not_html', 'HTML olmayan içerik');
    }
    const body = await readLimited(response, options.maxBytes);
    return { url: url.toString(), status: response.status, contentType, body, fetchedAt: new Date() };
  }
  throw new FetchError('too_many_redirects', 'Çok fazla yönlendirme');
}
