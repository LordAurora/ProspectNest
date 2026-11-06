export type SheetTab = { sheetId: number; title: string };

export type ValueRange = { range: string; values: string[][] };

/** The four Sheets operations the sync needs; implemented by the Google client and the in-memory fake. */
export interface SheetsApi {
  getTabs(spreadsheetId: string): Promise<{ title: string; tabs: SheetTab[] }>;
  addTab(spreadsheetId: string, title: string): Promise<SheetTab>;
  batchGet(spreadsheetId: string, ranges: string[]): Promise<string[][][]>;
  /** Writes literal values (valueInputOption RAW): text is never evaluated as a formula. */
  batchUpdateRaw(spreadsheetId: string, data: ValueRange[]): Promise<void>;
}

export type SheetsErrorKind = 'credentials' | 'not_found' | 'rate_limited' | 'unavailable' | 'header_changed' | 'ambiguous_rows' | 'sheet_changed' | 'locked';

const userMessages: Record<SheetsErrorKind, string> = {
  credentials: 'Google kimlik bilgisi geçersiz veya tabloya erişim yok. Tabloyu service account e-postasıyla paylaşıp yeniden bağlayın.',
  not_found: 'Tablo bulunamadı. Tablo kimliğini kontrol edin.',
  rate_limited: 'Google Sheets kota sınırına ulaşıldı; aktarım daha sonra yeniden denenecek.',
  unavailable: 'Google Sheets şu an yanıt vermiyor; aktarım daha sonra yeniden denenecek.',
  header_changed: 'Sekmedeki başlık satırı değiştirilmiş. Uygulama sütunlarının sırasını geri alın; yanlış sütuna yazmamak için aktarım durduruldu.',
  ambiguous_rows: "Aynı lead_id birden fazla satırda var. Tekrarlanan satırı silin; yanlış satıra yazmamak için aktarım durduruldu.",
  sheet_changed: 'Aktarım sırasında satırlar sıralandı veya silindi. Eşleştirme bir sonraki denemede yeniden yapılacak.',
  locked: 'Bu tabloya başka bir aktarım yazıyor; sırası gelince devam edecek.',
};

export class SheetsError extends Error {
  constructor(
    readonly kind: SheetsErrorKind,
    message: string = userMessages[kind],
  ) {
    super(message);
    this.name = 'SheetsError';
  }

  get retryable(): boolean {
    return this.kind === 'rate_limited' || this.kind === 'unavailable' || this.kind === 'sheet_changed' || this.kind === 'locked';
  }

  get userMessage(): string {
    return userMessages[this.kind];
  }
}

/** A1 notation with a safely quoted tab title. */
export function a1(title: string, range: string): string {
  return `'${title.replace(/'/g, "''")}'!${range}`;
}
