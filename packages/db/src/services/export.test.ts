import { describe, expect, it } from 'vitest';
import { toExport, type LeadWithBusiness } from './export';

const at = new Date('2026-11-07T10:00:00Z');

function lead(overrides: { isDemo?: boolean; sourcePolicy?: 'allowed' | 'restricted' | 'forbidden'; evidencePolicy?: 'allowed' | 'restricted' } = {}) {
  return {
    id: 'lead-1',
    opportunityScore: 65,
    priority: 'high',
    aiStatus: 'skipped',
    firstSeenAt: at,
    business: {
      name: 'Lavanta Kahve Evi',
      country: 'TR',
      city: 'İstanbul',
      category: 'Kafe',
      website: 'https://lavanta.example',
      lastCheckedAt: at,
      isDemo: overrides.isDemo ?? false,
      contacts: [{ kind: 'email', value: 'merhaba@lavanta.example' }],
      sources: [{ provider: 'csv', exportPolicy: overrides.sourcePolicy ?? 'allowed' }],
      evidence: [
        { sourceUrl: 'https://lavanta.example/menu.pdf', exportPolicy: overrides.evidencePolicy ?? 'allowed' },
        { sourceUrl: 'kaynak-kaydi', exportPolicy: 'allowed' },
      ],
    },
  } as unknown as LeadWithBusiness;
}

describe('export policy', () => {
  it('exports an allowed lead with http evidence links only', () => {
    const { lead: exported, block } = toExport(lead());
    expect(block).toBeUndefined();
    expect(exported).toMatchObject({ name: 'Lavanta Kahve Evi', assessment: 'Yüksek', emails: ['merhaba@lavanta.example'], aiStatus: 'kapalı' });
    expect(exported?.evidenceLinks).toEqual(['https://lavanta.example/menu.pdf']);
  });

  it('withholds synthetic demo rows', () => {
    expect(toExport(lead({ isDemo: true }))).toMatchObject({ block: { reason: expect.stringContaining('demo') } });
  });

  it('withholds leads from a source that forbids export', () => {
    const result = toExport(lead({ sourcePolicy: 'forbidden' }));
    expect(result.lead).toBeUndefined();
    expect(result.block?.reason).toContain('csv');
  });

  it('drops restricted evidence from the links but keeps the lead', () => {
    expect(toExport(lead({ evidencePolicy: 'restricted' })).lead?.evidenceLinks).toEqual([]);
  });
});
