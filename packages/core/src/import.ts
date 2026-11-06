import { z } from 'zod';
import { normalizeDomain, normalizeName } from './normalize';

/** Fields a CSV column can be mapped to. */
export const IMPORT_FIELDS = [
  'name',
  'website',
  'email',
  'phone',
  'country',
  'city',
  'district',
  'address',
  'category',
  'externalId',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const importFieldLabel: Record<ImportField, string> = {
  name: 'İşletme adı',
  website: 'Web sitesi',
  email: 'E-posta',
  phone: 'Telefon',
  country: 'Ülke',
  city: 'Şehir',
  district: 'İlçe / semt',
  address: 'Adres',
  category: 'Kategori',
  externalId: 'Kaynak kimliği',
};

const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ['name', 'business', 'business name', 'isletme', 'isletme adi', 'firma', 'firma adi', 'ad', 'unvan'],
  website: ['website', 'web', 'web sitesi', 'site', 'url', 'domain', 'internet sitesi'],
  email: ['email', 'e-mail', 'e-posta', 'eposta', 'mail'],
  phone: ['phone', 'telephone', 'tel', 'telefon', 'gsm', 'cep'],
  country: ['country', 'ulke'],
  city: ['city', 'sehir', 'il'],
  district: ['district', 'ilce', 'semt', 'mahalle', 'neighborhood'],
  address: ['address', 'adres', 'acik adres'],
  category: ['category', 'kategori', 'tur', 'sektor', 'type'],
  externalId: ['id', 'external id', 'externalid', 'kaynak id', 'kayit no', 'ref'],
};

/** column index → field, or null when a column is ignored. */
export type ColumnMapping = (ImportField | null)[];

export const columnMappingSchema = z.array(z.enum(IMPORT_FIELDS).nullable()).max(100);

export function guessMapping(header: string[]): ColumnMapping {
  const used = new Set<ImportField>();
  return header.map((column) => {
    const key = normalizeName(column);
    const match = IMPORT_FIELDS.find(
      (field) => !used.has(field) && HEADER_ALIASES[field].some((alias) => normalizeName(alias) === key),
    );
    if (!match) return null;
    used.add(match);
    return match;
  });
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

export const businessInputSchema = z.object({
  name: z.string().trim().min(1, 'İşletme adı gerekli').max(200, 'İşletme adı en fazla 200 karakter'),
  website: optional(500).refine((value) => value === undefined || normalizeDomain(value) !== null, 'Web sitesi geçerli bir adres değil'),
  email: optional(254).refine((value) => value === undefined || z.email().safeParse(value).success, 'E-posta sözdizimi geçersiz'),
  phone: optional(40).refine((value) => value === undefined || normalizePhone(value) !== null, 'Telefon numarası geçersiz'),
  country: optional(60),
  city: optional(80),
  district: optional(80),
  address: optional(300),
  category: optional(80),
  externalId: optional(200),
});
export type BusinessInput = z.output<typeof businessInputSchema>;

export type RowResult =
  | { row: number; ok: true; value: BusinessInput }
  | { row: number; ok: false; errors: string[]; raw: Record<string, string> };

/** Validates every row; `row` is the 1-based line number in the file including the header. */
export function validateRows(rows: string[][], mapping: ColumnMapping): RowResult[] {
  return rows.map((cells, index) => {
    const raw: Record<string, string> = {};
    mapping.forEach((field, column) => {
      if (field) raw[field] = cells[column] ?? '';
    });
    const parsed = businessInputSchema.safeParse(raw);
    const row = index + 2;
    if (parsed.success) return { row, ok: true, value: parsed.data };
    return { row, ok: false, errors: parsed.error.issues.map((issue) => issue.message), raw };
  });
}

/** Keeps a leading + and digits; Turkish local numbers (0xxx) become +90. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0') && digits.length === 11) return `+90${digits.slice(1)}`;
  if (digits.startsWith('90') && digits.length === 12) return `+${digits}`;
  return digits;
}

/**
 * Identifies a physical branch. Chains share a domain, so two rows with the
 * same domain are the same business only if their branch key also matches.
 */
export function branchKey(input: Pick<BusinessInput, 'name' | 'city' | 'district' | 'address'>): string {
  return [input.name, input.city, input.district, input.address].map((part) => normalizeName(part ?? '')).join('|');
}

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
