import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildLeadsWorkbook } from './xlsx';

describe('buildLeadsWorkbook', () => {
  it('writes leads as plain values with an info sheet', async () => {
    const buffer = await buildLeadsWorkbook(
      [
        {
          leadId: 'l1',
          name: '=HYPERLINK("http://evil.example")',
          country: 'TR',
          city: 'İzmir',
          category: 'Kafe',
          website: 'https://a.example',
          emails: ['a@a.example'],
          phones: ['+902320000000'],
          score: 75,
          assessment: 'Yüksek',
          evidenceLinks: ['https://a.example/menu.pdf'],
          source: 'csv',
          firstSeen: new Date('2026-11-01'),
          lastChecked: null,
          aiStatus: 'kapalı',
        },
      ],
      { campaignName: 'Test', generatedAt: new Date('2026-11-07T10:00:00Z'), excluded: [{ name: 'Demo', reason: 'Sentetik' }] },
    );

    const workbook = new ExcelJS.Workbook();
    // exceljs types predate the generic Buffer in @types/node.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('İşletmeler')!;
    expect(sheet.getRow(1).getCell(1).value).toBe('İşletme');
    const name = sheet.getRow(2).getCell(1);
    expect(name.type).toBe(ExcelJS.ValueType.String);
    expect(name.value).toBe('=HYPERLINK("http://evil.example")');
    expect(sheet.getRow(2).getCell(7).value).toBe(75);
    expect(workbook.getWorksheet('Bilgi')!.getColumn(2).values).toContain('Sentetik');
  });
});
