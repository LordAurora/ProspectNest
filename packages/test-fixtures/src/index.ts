import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Synthetic websites for offline research tests. Every domain uses the
 * reserved `.example` TLD; none of these businesses exist.
 */
const sitesDir = path.resolve(import.meta.dirname, '../sites');
const read = (file: string) => readFileSync(path.join(sitesDir, file), 'utf8');

export type FixtureResponse = { html: string; status?: number; contentType?: string } | { error: 'timeout' | 'network' | 'http_5xx' };

/** URL → response. URLs not listed respond with 404. */
export const siteFixtures: Record<string, FixtureResponse> = {
  // PDF menu + public contact page.
  'https://lavanta-kahve.example/': { html: read('lavanta-home.html') },
  'https://lavanta-kahve.example/menu': { html: read('lavanta-menu.html') },
  'https://lavanta-kahve.example/iletisim': { html: read('lavanta-contact.html') },
  // Working digital menu on a third-party host.
  'https://simitkosesi.example/': { html: read('simit-home.html') },
  'https://simitkosesi.qrmenu.example/menu': { html: '<html><body><h1>Menü</h1></body></html>' },
  // Menu requested by phone/WhatsApp.
  'https://bademli.example/': { html: read('bademli-home.html') },
  // Reachable site without evidence; contains an instruction aimed at a model.
  'https://ankaburger.example/': { html: read('anka-home.html') },
  // Bot challenge: must be reported as blocked, never bypassed.
  'https://galatatatli.example/': { html: read('captcha.html') },
  // Times out: must stay unknown, never "no website".
  'https://kordonpide.example/': { error: 'timeout' },
};
