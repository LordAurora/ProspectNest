import type { SheetTab, SheetsApi, ValueRange } from './api';

type Grid = string[][];

function parseRange(range: string): { title: string; cells: string } {
  const match = /^'((?:[^']|'')*)'!(.+)$/.exec(range);
  if (!match) throw new Error(`Bad range ${range}`);
  return { title: match[1]!.replace(/''/g, "'"), cells: match[2]! };
}

const colIndex = (letters: string) => letters.split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/**
 * In-memory spreadsheet for tests and fixture mode. Supports the ranges the
 * sync uses (`1:1`, `A2:A`, `A5:O5`, `A1`) and lets tests inject failures.
 */
export class FakeSheets implements SheetsApi {
  readonly grids = new Map<string, Grid>();
  private tabs: SheetTab[] = [];
  /** Called before each write; throw to simulate errors (optionally after applying). */
  beforeWrite?: (apply: () => void) => void;

  async getTabs() {
    return { title: 'Test tablosu', tabs: [...this.tabs] };
  }

  async addTab(_: string, title: string) {
    const tab = { sheetId: 1000 + this.tabs.length, title };
    this.tabs.push(tab);
    this.grids.set(title, []);
    return tab;
  }

  grid(title: string): Grid {
    const grid = this.grids.get(title);
    if (!grid) throw new Error(`No tab ${title}`);
    return grid;
  }

  async batchGet(_: string, ranges: string[]) {
    return ranges.map((range) => {
      const { title, cells } = parseRange(range);
      const grid = this.grid(title);
      if (cells === '1:1') return grid[0] ? [trimRow(grid[0])] : [];
      if (cells === 'A2:A') {
        const column = grid.slice(1).map((row) => [row[0] ?? '']);
        while (column.length > 0 && !column[column.length - 1]![0]) column.pop();
        return column;
      }
      throw new Error(`Unsupported read ${cells}`);
    });
  }

  async batchUpdateRaw(_: string, data: ValueRange[]) {
    const apply = () => {
      for (const { range, values } of data) {
        const { title, cells } = parseRange(range);
        const [, col = 'A', row = '1'] = /^([A-Z]+)(\d+)/.exec(cells) ?? [];
        const grid = this.grid(title);
        values.forEach((rowValues, r) => {
          const target = Number(row) - 1 + r;
          while (grid.length <= target) grid.push([]);
          const line = grid[target]!;
          rowValues.forEach((value, c) => {
            line[colIndex(col) + c] = value;
          });
        });
      }
    };
    if (this.beforeWrite) this.beforeWrite(apply);
    else apply();
  }

  /** Simulates a user sorting data rows by a column. */
  sortBy(title: string, column: number, descending = false) {
    const grid = this.grid(title);
    const [header, ...rows] = grid;
    rows.sort((a, b) => (a[column] ?? '').localeCompare(b[column] ?? '') * (descending ? -1 : 1));
    this.grids.set(title, [header ?? [], ...rows]);
  }
}

function trimRow(row: string[]) {
  const copy = [...row];
  while (copy.length > 0 && !copy[copy.length - 1]) copy.pop();
  return copy;
}
