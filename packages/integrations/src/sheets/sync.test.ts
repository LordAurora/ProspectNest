import { describe, expect, it } from 'vitest';
import { SheetsError } from './api';
import { HEADER, MACHINE_COLUMNS, tabTitleFor, toMachineRow, type LeadExport } from './columns';
import { FakeSheets } from './fake';
import { syncRows } from './sync';

const lead = (id: string, name: string, score = 50): LeadExport => ({
  leadId: id,
  name,
  country: 'TR',
  city: 'İzmir',
  category: 'Kafe',
  website: `https://${id}.example`,
  emails: [],
  phones: [],
  score,
  assessment: 'Orta',
  evidenceLinks: [],
  source: 'csv',
  firstSeen: new Date('2026-11-01'),
  lastChecked: null,
  aiStatus: 'kapalı',
});

const TAB = 'QR menü İzmir';
const input = (rows: LeadExport[]) => ({ spreadsheetId: 'sheet', tabTitle: TAB, tabId: null, rows: rows.map(toMachineRow) });

describe('syncRows', () => {
  it('creates the tab with header and appends new leads', async () => {
    const sheets = new FakeSheets();
    const result = await syncRows(sheets, input([lead('a', 'A'), lead('b', 'B')]));
    expect(result).toMatchObject({ appended: 2, updated: 0 });
    const grid = sheets.grid(TAB);
    expect(grid[0]).toEqual(HEADER);
    expect(grid.slice(1).map((r) => r[0])).toEqual(['a', 'b']);
  });

  it('updates by lead_id after the user sorts, keeping user columns', async () => {
    const sheets = new FakeSheets();
    await syncRows(sheets, input([lead('a', 'Ayva'), lead('b', 'Badem'), lead('c', 'Ceviz')]));
    const grid = sheets.grid(TAB);
    const notesCol = MACHINE_COLUMNS.length + 1;
    grid[2]![notesCol] = 'Pazartesi aranacak'; // user note on lead b
    sheets.sortBy(TAB, 1, true); // Ceviz, Badem, Ayva

    const result = await syncRows(sheets, input([lead('b', 'Badem Kafe', 80)]));
    expect(result).toMatchObject({ updated: 1, appended: 0 });
    const row = sheets.grid(TAB).find((r) => r[0] === 'b')!;
    expect(row[1]).toBe('Badem Kafe');
    expect(row[8]).toBe('80');
    expect(row[notesCol]).toBe('Pazartesi aranacak');
    expect(sheets.grid(TAB).filter((r) => r[0] === 'b')).toHaveLength(1);
  });

  it('does not duplicate rows when a write response is lost and retried', async () => {
    const sheets = new FakeSheets();
    await syncRows(sheets, input([lead('a', 'A')]));
    sheets.beforeWrite = (apply) => {
      apply();
      throw new SheetsError('unavailable');
    };
    await expect(syncRows(sheets, input([lead('a', 'A'), lead('b', 'B')]))).rejects.toMatchObject({ kind: 'unavailable' });
    sheets.beforeWrite = undefined;
    const retry = await syncRows(sheets, input([lead('a', 'A'), lead('b', 'B')]));
    expect(retry).toMatchObject({ updated: 2, appended: 0 });
    expect(sheets.grid(TAB).slice(1).map((r) => r[0])).toEqual(['a', 'b']);
  });

  it('stops when the header was rearranged', async () => {
    const sheets = new FakeSheets();
    await syncRows(sheets, input([lead('a', 'A')]));
    const header = sheets.grid(TAB)[0]!;
    [header[1], header[2]] = [header[2]!, header[1]!];
    await expect(syncRows(sheets, input([lead('a', 'A')]))).rejects.toMatchObject({ kind: 'header_changed' });
  });

  it('stops on duplicated lead_id instead of guessing the row', async () => {
    const sheets = new FakeSheets();
    await syncRows(sheets, input([lead('a', 'A')]));
    sheets.grid(TAB).push(['a', 'kopya']);
    await expect(syncRows(sheets, input([lead('a', 'A')]))).rejects.toMatchObject({ kind: 'ambiguous_rows' });
  });

  it('stops when rows move between read and write', async () => {
    const sheets = new FakeSheets();
    await syncRows(sheets, input([lead('a', 'A'), lead('b', 'B')]));
    const originalGet = sheets.batchGet.bind(sheets);
    let reads = 0;
    sheets.batchGet = async (id, ranges) => {
      reads += 1;
      if (reads === 2) sheets.sortBy(TAB, 0, true);
      return originalGet(id, ranges);
    };
    await expect(syncRows(sheets, input([lead('a', 'A2')]))).rejects.toMatchObject({ kind: 'sheet_changed', retryable: true });
  });

  it('writes formula-like text as data in RAW mode', async () => {
    const sheets = new FakeSheets();
    await syncRows(sheets, input([lead('a', '=IMPORTXML("http://x")')]));
    expect(sheets.grid(TAB)[1]![1]).toBe('=IMPORTXML("http://x")');
  });
});

describe('tabTitleFor', () => {
  it('removes characters Sheets forbids', () => {
    expect(tabTitleFor('Demo: QR [İzmir]/Ankara?')).toBe('Demo QR İzmir Ankara');
  });
});
