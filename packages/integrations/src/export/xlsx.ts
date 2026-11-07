import ExcelJS from 'exceljs';
import type { LeadExport } from '../sheets/columns';

export type WorkbookMeta = {
  campaignName: string;
  generatedAt: Date;
  excluded: { name: string; reason: string }[];
};

const COLUMNS: { header: string; key: string; width: number }[] = [
  { header: 'İşletme', key: 'name', width: 34 },
  { header: 'Şehir', key: 'city', width: 14 },
  { header: 'Kategori', key: 'category', width: 16 },
  { header: 'Web sitesi', key: 'website', width: 30 },
  { header: 'E-posta', key: 'emails', width: 30 },
  { header: 'Telefon', key: 'phones', width: 18 },
  { header: 'Puan', key: 'score', width: 8 },
  { header: 'Değerlendirme', key: 'assessment', width: 18 },
  { header: 'Kanıt bağlantıları', key: 'evidence', width: 40 },
  { header: 'Kaynak', key: 'source', width: 12 },
  { header: 'İlk görülme', key: 'firstSeen', width: 13 },
  { header: 'Son kontrol', key: 'lastChecked', width: 13 },
  { header: 'AI durumu', key: 'aiStatus', width: 12 },
  { header: 'Ülke', key: 'country', width: 8 },
  { header: 'lead_id', key: 'leadId', width: 38 },
];

/**
 * Builds a formatted .xlsx. Every text cell is written as a plain string,
 * so values that look like formulas are never evaluated by Excel.
 */
export async function buildLeadsWorkbook(leads: LeadExport[], meta: WorkbookMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ProspectNest';
  workbook.created = meta.generatedAt;

  const sheet = workbook.addWorksheet('İşletmeler', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS;
  for (const lead of leads) {
    sheet.addRow({
      name: lead.name,
      city: lead.city ?? '',
      category: lead.category ?? '',
      website: lead.website ?? '',
      emails: lead.emails.join(', '),
      phones: lead.phones.join(', '),
      score: lead.score,
      assessment: lead.assessment,
      evidence: lead.evidenceLinks.join('\n'),
      source: lead.source,
      firstSeen: lead.firstSeen,
      lastChecked: lead.lastChecked,
      aiStatus: lead.aiStatus,
      country: lead.country ?? '',
      leadId: lead.leadId,
    });
  }

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FF17212B' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F6' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  for (const key of ['firstSeen', 'lastChecked']) sheet.getColumn(key).numFmt = 'dd.mm.yyyy';
  sheet.getColumn('score').alignment = { horizontal: 'right' };
  sheet.getColumn('evidence').alignment = { wrapText: true, vertical: 'top' };

  const info = workbook.addWorksheet('Bilgi');
  info.columns = [
    { key: 'label', width: 26 },
    { key: 'value', width: 70 },
  ];
  info.addRows([
    { label: 'Kampanya', value: meta.campaignName },
    { label: 'Oluşturulma', value: meta.generatedAt },
    { label: 'Satır sayısı', value: leads.length },
    { label: 'Dışarıda bırakılan', value: meta.excluded.length },
    { label: 'Puan', value: 'Kanıtlardan türetilen 0–100 öncelik ipucu; satın alma olasılığı değildir.' },
    { label: 'E-posta', value: 'Yalnız açık kaynaklarda görülen adresler; teslim edilebilirlik doğrulanmadı.' },
  ]);
  info.getCell('B2').numFmt = 'dd.mm.yyyy hh:mm';
  info.getColumn('label').font = { bold: true };
  if (meta.excluded.length > 0) {
    info.addRow({});
    info.addRow({ label: 'Dışarıda kalan kayıt', value: 'Neden' }).font = { bold: true };
    for (const item of meta.excluded) info.addRow({ label: item.name, value: item.reason });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
