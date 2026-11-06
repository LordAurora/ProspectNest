import { describe, expect, it } from 'vitest';
import { defaultRuleSet } from './rules';
import { evaluate, type EvidenceInput } from './scoring';

const at = new Date('2026-11-07T10:00:00Z');
const ev = (id: string, signal: string, status: EvidenceInput['status'], excerpt: string | null = 'alıntı'): EvidenceInput => ({
  id,
  signal,
  status,
  excerpt,
  fetchedAt: at,
});
const qr = defaultRuleSet('qr_menu');
const noContacts = { email: 0, phone: 0 };

describe('evaluate (QR menu)', () => {
  it('raises a PDF-menu cafe above a cafe with a working digital menu', () => {
    const pdf = evaluate(qr, [ev('1', 'pdf_or_image_menu', 'present'), ev('2', 'menu_by_phone_request', 'not_observed'), ev('3', 'digital_menu_link', 'not_observed')], noContacts);
    const digital = evaluate(qr, [ev('4', 'pdf_or_image_menu', 'not_observed'), ev('5', 'menu_by_phone_request', 'not_observed'), ev('6', 'digital_menu_link', 'present')], noContacts);
    expect(pdf).toMatchObject({ score: 65, priority: 'high', evidenceCoverage: 1 });
    expect(digital).toMatchObject({ score: 15, priority: 'low' });
  });

  it('does not treat an unreachable site as evidence', () => {
    const result = evaluate(qr, [], noContacts);
    expect(result).toMatchObject({ score: 50, evidenceCoverage: 0, priority: 'not_evaluated' });
    expect(result.results.every((r) => r.status === 'unknown' && !r.fired)).toBe(true);
  });

  it('rejects a phone-menu claim without a quoted excerpt', () => {
    const result = evaluate(qr, [ev('1', 'menu_by_phone_request', 'present', '  ')], noContacts);
    expect(result.results.find((r) => r.signal === 'menu_by_phone_request')).toMatchObject({ status: 'unknown', fired: false });
  });

  it('keeps contactability separate from the need score', () => {
    const evidence = [ev('1', 'pdf_or_image_menu', 'not_observed'), ev('2', 'menu_by_phone_request', 'not_observed'), ev('3', 'digital_menu_link', 'not_observed')];
    const without = evaluate(qr, evidence, noContacts);
    const withContacts = evaluate(qr, evidence, { email: 2, phone: 1 });
    expect(withContacts.score).toBe(without.score);
    expect(withContacts.contactability).toBe(2);
  });

  it('uses the latest evidence per signal and clamps to 0–100', () => {
    const older = { ...ev('old', 'digital_menu_link', 'present'), fetchedAt: new Date('2026-01-01') };
    const result = evaluate(
      { baseScore: 90, rules: [{ id: 'pdf', signal: 'pdf_or_image_menu', when: 'present', impact: 50, enabled: true }, { id: 'dm', signal: 'digital_menu_link', when: 'present', impact: -35, enabled: true }] },
      [ev('1', 'pdf_or_image_menu', 'present'), older, ev('new', 'digital_menu_link', 'not_observed')],
      noContacts,
    );
    expect(result.score).toBe(100);
    expect(result.results.find((r) => r.ruleId === 'dm')).toMatchObject({ status: 'not_observed', evidenceIds: ['new'] });
  });

  it('ignores disabled rules entirely', () => {
    const ruleSet = { ...qr, rules: qr.rules.map((r) => ({ ...r, enabled: r.signal !== 'pdf_or_image_menu' })) };
    const result = evaluate(ruleSet, [ev('1', 'pdf_or_image_menu', 'present')], noContacts);
    expect(result.results.some((r) => r.signal === 'pdf_or_image_menu')).toBe(false);
  });
});

describe('evaluate (other templates)', () => {
  it('scores a missing website for the website template only when the source record was inspected', () => {
    const result = evaluate(defaultRuleSet('website'), [ev('1', 'website_present', 'not_observed', null), ev('2', 'social_only', 'present')], noContacts);
    expect(result.results.find((r) => r.ruleId === 'website_present_not_observed')?.fired).toBe(true);
    expect(result.score).toBe(95);
  });

  it('gives an appointment template low priority when online booking exists', () => {
    const result = evaluate(defaultRuleSet('appointment'), [ev('1', 'online_booking_link', 'present'), ev('2', 'whatsapp_contact', 'not_observed')], noContacts);
    expect(result).toMatchObject({ score: 15, priority: 'low' });
  });
});
