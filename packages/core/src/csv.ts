/**
 * Small RFC 4180 CSV reader. Handles quoted fields, escaped quotes, CRLF,
 * a UTF-8 BOM and the `;` delimiter Excel uses in Turkish locales.
 */

export type ParsedCsv = { header: string[]; rows: string[][]; delimiter: string };

const CANDIDATE_DELIMITERS = [',', ';', '\t'] as const;

function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  let best: string = ',';
  let bestCount = 0;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    // Count only delimiters outside quotes on the header line.
    let count = 0;
    let quoted = false;
    for (const char of firstLine) {
      if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ''));
  const [header = [], ...rows] = nonEmpty;
  return { header: header.map((h) => h.trim()), rows, delimiter };
}

/**
 * Neutralises spreadsheet formula injection: a cell starting with = + - @ or a
 * control character is prefixed with an apostrophe before it leaves the system.
 */
export function escapeSpreadsheetCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = escapeSpreadsheetCell(cell == null ? '' : String(cell));
          return /[",\r\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\r\n');
}
