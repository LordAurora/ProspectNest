/**
 * Managed tab layout. The app owns columns A–O and only ever writes those
 * cells; the user columns to their right are created once with the header
 * and never written again, so notes typed in Sheets survive every sync.
 */
export const MACHINE_COLUMNS = [
  'lead_id',
  'isletme_adi',
  'ulke',
  'sehir',
  'kategori',
  'web_sitesi',
  'eposta',
  'telefon',
  'kural_puani',
  'degerlendirme',
  'kanit_baglantilari',
  'kaynak',
  'first_seen',
  'last_checked',
  'ai_status',
] as const;

export const USER_COLUMNS = ['takip_durumu', 'notlar', 'son_iletisim', 'sonraki_adim_tarihi'] as const;

export const HEADER = [...MACHINE_COLUMNS, ...USER_COLUMNS];

/** Column letter of the last machine-owned column (O). */
export const LAST_MACHINE_COLUMN = String.fromCharCode('A'.charCodeAt(0) + MACHINE_COLUMNS.length - 1);

export type MachineRow = { leadId: string; values: string[] };

export type LeadExport = {
  leadId: string;
  name: string;
  country: string | null;
  city: string | null;
  category: string | null;
  website: string | null;
  emails: string[];
  phones: string[];
  score: number | null;
  assessment: string;
  evidenceLinks: string[];
  source: string;
  firstSeen: Date;
  lastChecked: Date | null;
  aiStatus: string;
};

const date = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : '');

export function toMachineRow(lead: LeadExport): MachineRow {
  const values = [
    lead.leadId,
    lead.name,
    lead.country ?? '',
    lead.city ?? '',
    lead.category ?? '',
    lead.website ?? '',
    lead.emails.join(', '),
    lead.phones.join(', '),
    lead.score === null ? '' : String(lead.score),
    lead.assessment,
    lead.evidenceLinks.slice(0, 5).join('\n'),
    lead.source,
    date(lead.firstSeen),
    date(lead.lastChecked),
    lead.aiStatus,
  ];
  return { leadId: lead.leadId, values };
}

/** Sheet tab titles may not contain []*?/\: and are capped at 100 characters. */
export function tabTitleFor(campaignName: string): string {
  const cleaned = campaignName.replace(/[[\]*?/\\:]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Kampanya').slice(0, 90);
}
