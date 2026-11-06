import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { normalizePhone, type Signal } from '@prospectnest/core';

export type PageSignal = { signal: Signal; excerpt: string; url?: string };

export type PageExtraction = {
  signals: PageSignal[];
  /** Candidate digital menu URLs; only counted once a request confirms they load. */
  digitalMenuCandidates: { url: string; excerpt: string }[];
  emails: string[];
  phones: string[];
  links: string[];
  blocked: boolean;
  contentHash: string;
};

const EXCERPT_LENGTH = 160;
const FILE_EXTENSIONS = /\.(pdf|jpe?g|png|webp|gif|svg|zip|docx?|xlsx?|mp4|mp3)(\?|#|$)/i;
const IMAGE_OR_PDF = /\.(pdf|jpe?g|png|webp)(\?|#|$)/i;
const MENU_WORD = /men[uü]|fiyat\s*listesi|price\s*list|carte|yemek\s*listesi/i;

const DIGITAL_MENU_HOSTS = /(^|\.)(qrmenu|qr-menu|menulux|finedinemenu|adisyo|menu\.app|menuqr|qrmenum|menum\.online|dijitalmenu)\b/i;
const DIGITAL_MENU_TEXT = /(dijital|online|qr)\s*men[uü]/i;
const BOOKING_HOSTS = /(^|\.)(calendly\.com|booksy\.com|fresha\.com|simplybook\.(me|it)|setmore\.com|acuityscheduling\.com|randevu\w*\.(com|net))$/i;
const BOOKING_TEXT = /online\s*randevu|randevu\s*al|book\s*(an\s*)?appointment/i;
const RESERVATION_HOSTS = /(^|\.)(opentable\.\w+|resy\.com|sevenrooms\.com|quandoo\.\w+|tablein\.com|thefork\.\w+)$/i;
const RESERVATION_TEXT = /rezervasyon\s*yap|online\s*rezervasyon|book\s*a\s*table|masa\s*ay[ıi]r/i;
const CART_TEXT = /sepete\s*ekle|add\s*to\s*cart|sepetim|sat[ıi]n\s*al\b/i;
const PHONE_MENU_REQUEST =
  /[^.!?\n]{0,80}(men[uü]\w*)[^.!?\n]{0,60}(aray[ıi]n\w*|whatsapp|mesaj\w*|yaz[ıi]n\w*|ileti[sş]ime\s*ge[cç]in\w*)[^.!?\n]{0,40}|[^.!?\n]{0,60}(aray[ıi]n\w*|whatsapp)[^.!?\n]{0,60}(men[uü]\w*)[^.!?\n]{0,40}/i;
const CAPTCHA = /captcha|cf-challenge|cf_chl_|are you a robot|robot\s*de[gğ]ilim|just a moment\.\.\./i;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
const EMAIL_FALSE_POSITIVE = /\.(png|jpe?g|gif|webp|svg|css|js)$|@(sentry|example|domain|email)\./i;
const PHONE_PATTERN = /(?:\+90|0)[\s.-]*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g;

const CONTENT_LINK = /iletisim|ileti[sş]im|contact|men[uü]|menu|hizmet|services|rezervasyon|reservation|randevu|booking|hakk[ıi]m[ıi]zda|about|fiyat|price/i;

function clip(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > EXCERPT_LENGTH ? `${clean.slice(0, EXCERPT_LENGTH - 1)}…` : clean;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function resolve(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Extracts observations from one HTML page. External HTML is parsed as data
 * only: scripts are dropped and nothing is executed or rendered.
 */
export function extractPage(html: string, pageUrl: string): PageExtraction {
  const $ = cheerio.load(html);
  const rawHtml = html.slice(0, 200_000);
  $('script, style, noscript, template, iframe').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const pageHost = hostOf(pageUrl);

  const signals: PageSignal[] = [];
  const add = (signal: Signal, excerpt: string, url?: string) => {
    if (!signals.some((s) => s.signal === signal)) signals.push({ signal, excerpt: clip(excerpt), ...(url ? { url } : {}) });
  };
  const digitalMenuCandidates: PageExtraction['digitalMenuCandidates'] = [];
  const emails = new Set<string>();
  const phones = new Set<string>();
  const links = new Set<string>();

  $('a[href]').each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr('href')?.trim() ?? '';
    const label = clip(anchor.text() || anchor.attr('title') || anchor.attr('aria-label') || '');

    if (/^mailto:/i.test(href)) {
      const address = decodeURIComponent(href.slice(7).split('?')[0] ?? '').trim().toLowerCase();
      if (address) emails.add(address);
      return;
    }
    if (/^tel:/i.test(href)) {
      const phone = normalizePhone(decodeURIComponent(href.slice(4)));
      if (phone) phones.add(phone);
      return;
    }
    const url = resolve(href, pageUrl);
    if (!url || !/^https?:/i.test(url)) {
      if (/^whatsapp:/i.test(href)) add('whatsapp_contact', label || 'WhatsApp bağlantısı');
      return;
    }
    const host = hostOf(url) ?? '';

    if (/^(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)$/.test(host)) add('whatsapp_contact', label || url, url);
    if (IMAGE_OR_PDF.test(url) && (MENU_WORD.test(url) || MENU_WORD.test(label))) add('pdf_or_image_menu', label || url, url);
    if (!IMAGE_OR_PDF.test(url) && (DIGITAL_MENU_HOSTS.test(host) || DIGITAL_MENU_TEXT.test(label))) {
      digitalMenuCandidates.push({ url, excerpt: clip(label || url) });
    }
    if (BOOKING_HOSTS.test(host) || BOOKING_TEXT.test(label)) add('online_booking_link', label || url, url);
    if (RESERVATION_HOSTS.test(host) || RESERVATION_TEXT.test(label)) add('reservation_widget', label || url, url);

    if (host === pageHost && !FILE_EXTENSIONS.test(url) && (CONTENT_LINK.test(url) || CONTENT_LINK.test(label))) links.add(url);
  });

  $('img').each((_, element) => {
    const img = $(element);
    const alt = img.attr('alt') ?? '';
    const src = img.attr('src') ?? '';
    if (MENU_WORD.test(alt) || /men[uü]/i.test(src.split('/').pop() ?? '')) {
      add('pdf_or_image_menu', alt || src, resolve(src, pageUrl) ?? undefined);
    }
  });

  if ($('form').filter((_, f) => RESERVATION_TEXT.test($(f).text())).length > 0) add('reservation_widget', 'Rezervasyon formu');
  const cartMatch = CART_TEXT.exec(text);
  if (cartMatch) add('ecommerce_cart', cartMatch[0]);
  else if (/cdn\.shopify\.com|woocommerce-cart|wc-add-to-cart/i.test(rawHtml)) add('ecommerce_cart', 'Online mağaza altyapısı');

  const phoneRequest = PHONE_MENU_REQUEST.exec(text);
  if (phoneRequest) add('menu_by_phone_request', phoneRequest[0]);

  for (const match of text.matchAll(EMAIL_PATTERN)) {
    const address = match[0].toLowerCase();
    if (!EMAIL_FALSE_POSITIVE.test(address)) emails.add(address);
  }
  for (const match of text.matchAll(PHONE_PATTERN)) {
    const phone = normalizePhone(match[0]);
    if (phone) phones.add(phone);
  }
  // Scripts were stripped from the DOM, so structured data is read from the raw markup.
  for (const block of rawHtml.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = block[1] ?? '';
    for (const email of body.matchAll(/"email"\s*:\s*"(?:mailto:)?([^"]+@[^"]+)"/gi)) if (email[1]) emails.add(email[1].toLowerCase());
    for (const tel of body.matchAll(/"telephone"\s*:\s*"([^"]+)"/gi)) {
      const phone = tel[1] ? normalizePhone(tel[1]) : null;
      if (phone) phones.add(phone);
    }
  }

  const title = $('title').text();
  const passwordOnly = $('input[type="password"]').length > 0 && $('a[href]').length < 5;
  const blocked = CAPTCHA.test(title) || CAPTCHA.test(rawHtml.slice(0, 20_000)) || passwordOnly;

  return {
    signals,
    digitalMenuCandidates,
    emails: [...emails].slice(0, 20),
    phones: [...phones].slice(0, 20),
    links: [...links],
    blocked,
    contentHash: createHash('sha256').update(text).digest('hex'),
  };
}
