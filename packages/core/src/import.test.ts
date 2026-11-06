import { describe, expect, it } from 'vitest';
import { escapeSpreadsheetCell, parseCsv } from './csv';
import { branchKey, guessMapping, normalizePhone, validateRows } from './import';
import { defaultRuleSet, ruleSetSchema, validateRuleSetForTemplate } from './rules';

describe('parseCsv', () => {
  it('handles BOM, semicolons, quotes and CRLF', () => {
    const csv = '﻿İşletme Adı;Web Sitesi;Adres\r\n"Ege ""Sofrası""";egesofrasi.example;"Kordon, No: 5"\r\n\r\nKahve;;\r\n';
    const parsed = parseCsv(csv);
    expect(parsed.delimiter).toBe(';');
    expect(parsed.header).toEqual(['İşletme Adı', 'Web Sitesi', 'Adres']);
    expect(parsed.rows).toEqual([
      ['Ege "Sofrası"', 'egesofrasi.example', 'Kordon, No: 5'],
      ['Kahve', '', ''],
    ]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('name,address\nA,"line1\nline2"').rows).toEqual([['A', 'line1\nline2']]);
  });
});

describe('guessMapping', () => {
  it('maps Turkish and English headers and ignores unknown ones', () => {
    expect(guessMapping(['İşletme Adı', 'E-posta', 'Şehir', 'İlçe', 'Notlar', 'Telefon'])).toEqual([
      'name',
      'email',
      'city',
      'district',
      null,
      'phone',
    ]);
  });
});

describe('validateRows', () => {
  it('reports per-row errors with file line numbers', () => {
    const results = validateRows(
      [
        ['Lavanta', 'lavanta.example', 'merhaba@lavanta.example'],
        ['', 'not a url', 'broken@'],
      ],
      ['name', 'website', 'email'],
    );
    expect(results[0]).toMatchObject({ ok: true, row: 2 });
    expect(results[1]).toMatchObject({ ok: false, row: 3 });
    if (results[1]?.ok === false) expect(results[1].errors).toHaveLength(3);
  });
});

describe('normalizePhone', () => {
  it('normalises Turkish formats to E.164', () => {
    expect(normalizePhone('0 (216) 000 00 01')).toBe('+902160000001');
    expect(normalizePhone('+90 216 000 00 01')).toBe('+902160000001');
    expect(normalizePhone('0090 216 000 00 01')).toBe('+902160000001');
    expect(normalizePhone('12')).toBeNull();
  });
});

describe('branchKey', () => {
  it('separates chain branches that share a domain', () => {
    const moda = branchKey({ name: 'Simit Köşesi', city: 'İstanbul', district: 'Kadıköy' });
    const besiktas = branchKey({ name: 'Simit Köşesi', city: 'İstanbul', district: 'Beşiktaş' });
    expect(moda).not.toBe(besiktas);
    expect(branchKey({ name: 'SİMİT KÖŞESİ', city: 'istanbul', district: 'kadıköy' })).toBe(moda);
  });
});

describe('rule sets', () => {
  it('ships valid defaults for every template', () => {
    for (const template of ['qr_menu', 'website', 'appointment', 'reservation', 'ecommerce'] as const) {
      const ruleSet = ruleSetSchema.parse(defaultRuleSet(template));
      expect(validateRuleSetForTemplate(template, ruleSet)).toBeNull();
    }
  });

  it('rejects signals outside the template and out-of-range weights', () => {
    const qr = defaultRuleSet('qr_menu');
    expect(validateRuleSetForTemplate('appointment', qr)).not.toBeNull();
    const tooStrong = { ...qr, rules: [{ ...qr.rules[0]!, impact: 90 }] };
    expect(ruleSetSchema.safeParse(tooStrong).success).toBe(false);
  });
});

describe('escapeSpreadsheetCell', () => {
  it('prefixes formula-like values', () => {
    expect(escapeSpreadsheetCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(escapeSpreadsheetCell('Kafe')).toBe('Kafe');
  });
});

describe('time zones', () => {
  it('finds local midnight in Istanbul (UTC+3)', async () => {
    const { startOfDayInTimeZone, localDateKey } = await import('./time');
    const at = new Date('2026-11-07T01:30:00Z'); // 04:30 in Istanbul
    expect(startOfDayInTimeZone(at, 'Europe/Istanbul').toISOString()).toBe('2026-11-06T21:00:00.000Z');
    expect(localDateKey(at, 'Europe/Istanbul')).toBe('2026-11-07');
    expect(localDateKey(at, 'America/New_York')).toBe('2026-11-06');
  });
});
