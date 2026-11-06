import { JWT } from 'google-auth-library';
import { SheetsError, type SheetTab, type SheetsApi, type ValueRange } from './api';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

type GaxiosLikeError = { response?: { status?: number } };

function mapError(error: unknown): never {
  const status = (error as GaxiosLikeError).response?.status;
  if (status === 401 || status === 403) throw new SheetsError('credentials');
  if (status === 404) throw new SheetsError('not_found');
  if (status === 429) throw new SheetsError('rate_limited');
  throw new SheetsError('unavailable');
}

/**
 * Sheets REST client authenticated as a service account. The key file stays
 * on the server (GOOGLE_APPLICATION_CREDENTIALS); the user shares their own
 * spreadsheet with the service account address. No Gmail or Drive scopes.
 */
export function createGoogleSheetsApi(keyFile: string): SheetsApi {
  const auth = new JWT({ keyFile, scopes: SCOPES });

  async function call<T>(url: string, method: 'GET' | 'POST' = 'GET', data?: unknown): Promise<T> {
    try {
      const response = await auth.request<T>({ url, method, data, timeout: 20_000 });
      return response.data;
    } catch (error) {
      mapError(error);
    }
  }

  return {
    async getTabs(spreadsheetId) {
      const body = await call<{ properties: { title: string }; sheets?: { properties: SheetTab }[] }>(
        `${BASE}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties(sheetId,title)`,
      );
      return { title: body.properties.title, tabs: (body.sheets ?? []).map((s) => ({ sheetId: s.properties.sheetId, title: s.properties.title })) };
    },
    async addTab(spreadsheetId, title) {
      const body = await call<{ replies: { addSheet: { properties: SheetTab } }[] }>(
        `${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        'POST',
        { requests: [{ addSheet: { properties: { title } } }] },
      );
      const properties = body.replies[0]!.addSheet.properties;
      return { sheetId: properties.sheetId, title: properties.title };
    },
    async batchGet(spreadsheetId, ranges) {
      const query = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
      const body = await call<{ valueRanges?: { values?: string[][] }[] }>(
        `${BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
      );
      return ranges.map((_, i) => body.valueRanges?.[i]?.values ?? []);
    },
    async batchUpdateRaw(spreadsheetId, data: ValueRange[]) {
      await call(`${BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, 'POST', { valueInputOption: 'RAW', data });
    },
  };
}

/** Reads the service account address so the UI can tell the user whom to share the sheet with. */
export async function readServiceAccountEmail(keyFile: string): Promise<string | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    const parsed = JSON.parse(await readFile(keyFile, 'utf8')) as { client_email?: unknown };
    return typeof parsed.client_email === 'string' ? parsed.client_email : null;
  } catch {
    return null;
  }
}
