import { a1, SheetsError, type SheetsApi, type ValueRange } from './api';
import { HEADER, LAST_MACHINE_COLUMN, MACHINE_COLUMNS, type MachineRow } from './columns';

export type SyncInput = {
  spreadsheetId: string;
  tabTitle: string;
  /** Previously created tab; looked up by id first so a renamed tab is still found. */
  tabId: number | null;
  rows: MachineRow[];
};

export type SyncOutput = {
  tabId: number;
  tabTitle: string;
  updated: number;
  appended: number;
  writtenLeadIds: string[];
};

async function ensureTab(api: SheetsApi, input: SyncInput) {
  const { tabs } = await api.getTabs(input.spreadsheetId);
  const existing = tabs.find((t) => t.sheetId === input.tabId) ?? tabs.find((t) => t.title === input.tabTitle);
  return existing ?? (await api.addTab(input.spreadsheetId, input.tabTitle));
}

/** lead_id → 1-based row number. Duplicate ids make the mapping ambiguous, so nothing is written. */
function indexLeadIds(column: string[][]): Map<string, number> {
  const index = new Map<string, number>();
  column.forEach((cells, i) => {
    const id = cells[0]?.trim();
    if (!id) return;
    if (index.has(id)) throw new SheetsError('ambiguous_rows');
    index.set(id, i + 2);
  });
  return index;
}

const sameIndex = (a: Map<string, number>, b: Map<string, number>) =>
  a.size === b.size && [...a].every(([id, row]) => b.get(id) === row);

/**
 * Upserts machine-owned cells by lead_id.
 *
 * - Rows are matched by lead_id, never by position, so user sorting is harmless.
 * - Only columns A–O are written; user columns are left untouched.
 * - New rows go to explicit row numbers rather than "append": if a response is
 *   lost and the call is retried, the next run finds the ids and updates them
 *   instead of appending duplicates.
 * - The id column is read again right before writing; if rows moved in the
 *   meantime the sync stops instead of risking a write to the wrong row.
 */
export async function syncRows(api: SheetsApi, input: SyncInput): Promise<SyncOutput> {
  const tab = await ensureTab(api, input);
  const headerRange = a1(tab.title, '1:1');
  const idRange = a1(tab.title, 'A2:A');

  const [header = [], ids = []] = await api.batchGet(input.spreadsheetId, [headerRange, idRange]);
  const headerCells = header[0] ?? [];
  if (headerCells.length === 0) {
    await api.batchUpdateRaw(input.spreadsheetId, [{ range: a1(tab.title, 'A1'), values: [HEADER] }]);
  } else if (MACHINE_COLUMNS.some((name, i) => headerCells[i]?.trim() !== name)) {
    throw new SheetsError('header_changed');
  }

  const index = indexLeadIds(ids);
  let nextRow = ids.length + 2;
  const data: ValueRange[] = [];
  let updated = 0;
  let appended = 0;

  for (const row of input.rows) {
    const existing = index.get(row.leadId);
    const target = existing ?? nextRow++;
    if (existing) updated += 1;
    else appended += 1;
    data.push({ range: a1(tab.title, `A${target}:${LAST_MACHINE_COLUMN}${target}`), values: [row.values] });
  }

  if (data.length > 0) {
    const [recheck = []] = await api.batchGet(input.spreadsheetId, [idRange]);
    if (!sameIndex(index, indexLeadIds(recheck)) || recheck.length !== ids.length) throw new SheetsError('sheet_changed');
    await api.batchUpdateRaw(input.spreadsheetId, data);
  }

  return { tabId: tab.sheetId, tabTitle: tab.title, updated, appended, writtenLeadIds: input.rows.map((r) => r.leadId) };
}
