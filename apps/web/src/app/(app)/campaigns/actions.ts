'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  businessInputSchema,
  campaignInputSchema,
  columnMappingSchema,
  parseCsv,
  validateRows,
  type CampaignInput,
} from '@prospectnest/core';
import { importBusinesses, type ImportCounters, type ImportRowError } from '@prospectnest/db';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { discoveryStatus } from '@/lib/system';

export type FieldErrors = Record<string, string>;

function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] === 'ruleSet' ? 'ruleSet' : String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}

export async function createCampaign(input: CampaignInput): Promise<{ errors: FieldErrors }> {
  const user = await requireUser();
  const parsed = campaignInputSchema.safeParse(input);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  const data = parsed.data;
  if (data.source === 'discovery' && discoveryStatus().status !== 'ready') {
    return { errors: { source: 'Canlı keşif için önce bir keşif sağlayıcısı bağlanmalı.' } };
  }

  const campaign = await db().campaign.create({
    data: {
      name: data.name,
      serviceDescription: data.serviceDescription,
      template: data.template,
      rules: data.ruleSet,
      source: data.source,
      countries: data.countries,
      cities: data.cities,
      categories: data.categories,
      language: data.language,
      timezone: data.timezone,
      dailyNewLimit: data.dailyNewLimit,
      dailyPageBudget: data.dailyPageBudget,
      recheckIntervalDays: data.recheckIntervalDays,
    },
  });
  await db().auditEvent.create({ data: { action: 'campaign.created', actorId: user.id, subject: campaign.id } });
  revalidatePath('/campaigns');
  redirect(`/campaigns/${campaign.id}`);
}

const campaignIdSchema = z.uuid();

async function requireCampaign(campaignId: string) {
  const id = campaignIdSchema.parse(campaignId);
  const campaign = await db().campaign.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
  if (!campaign || campaign.archivedAt) throw new Error('Kampanya bulunamadı');
  return campaign;
}

export type ManualBusinessState = { errors?: FieldErrors; message?: string; ok?: boolean };

export async function addManualBusiness(
  campaignId: string,
  _: ManualBusinessState,
  formData: FormData,
): Promise<ManualBusinessState> {
  const user = await requireUser();
  const campaign = await requireCampaign(campaignId);
  const parsed = businessInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  const result = await importBusinesses(db(), {
    campaignId: campaign.id,
    provider: 'manual',
    rows: [{ row: 1, value: parsed.data }],
    invalid: [],
  });
  await db().auditEvent.create({ data: { action: 'business.added', actorId: user.id, subject: campaign.id } });
  revalidatePath(`/campaigns/${campaign.id}`);

  const { counters } = result;
  if (counters.alreadyInCampaign > 0) return { ok: true, message: 'Bu işletme kampanyada zaten var; kaynak bilgisi güncellendi.' };
  if (counters.matched > 0) return { ok: true, message: 'Mevcut bir işletmeyle eşleşti ve kampanyaya eklendi.' };
  if (counters.possibleDuplicates > 0) {
    return { ok: true, message: 'Eklendi. Aynı ad ve şehirde başka bir kayıt olduğu için inceleme bekliyor.' };
  }
  return { ok: true, message: 'İşletme eklendi.' };
}

const importSchema = z.object({
  csv: z.string().max(MAX_IMPORT_BYTES, 'Dosya en fazla 2 MB olabilir'),
  mapping: columnMappingSchema,
  fileName: z.string().max(255).optional(),
});

export type ImportOutcome =
  | { ok: true; runId: string; counters: ImportCounters; errors: ImportRowError[] }
  | { ok: false; error: string };

/** The client preview is a convenience; the file is parsed and validated again here. */
export async function importCsv(campaignId: string, input: z.input<typeof importSchema>): Promise<ImportOutcome> {
  const user = await requireUser();
  const campaign = await requireCampaign(campaignId);
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Geçersiz istek' };

  const { header, rows } = parseCsv(parsed.data.csv);
  const { mapping } = parsed.data;
  if (header.length === 0 || rows.length === 0) return { ok: false, error: 'Dosyada başlık satırı ve en az bir kayıt olmalı.' };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: `Tek seferde en fazla ${MAX_IMPORT_ROWS} satır içe aktarılabilir.` };
  if (mapping.length !== header.length) return { ok: false, error: 'Kolon eşlemesi dosyayla uyuşmuyor. Dosyayı yeniden seçin.' };
  if (!mapping.includes('name')) return { ok: false, error: 'İşletme adı kolonu eşlenmeli.' };

  const results = validateRows(rows, mapping);
  const valid = results.flatMap((r) => (r.ok ? [{ row: r.row, value: r.value }] : []));
  const invalid = results.flatMap((r) => (r.ok ? [] : [{ row: r.row, errors: r.errors }]));

  const result = await importBusinesses(db(), {
    campaignId: campaign.id,
    provider: 'csv',
    rows: valid,
    invalid,
    ...(parsed.data.fileName ? { fileName: parsed.data.fileName } : {}),
  });
  await db().auditEvent.create({
    data: {
      action: 'import.completed',
      actorId: user.id,
      subject: campaign.id,
      metadata: { runId: result.runId, ...result.counters },
    },
  });
  revalidatePath(`/campaigns/${campaign.id}`);
  revalidatePath('/businesses');
  return { ok: true, ...result };
}

export type ScheduleState = { error?: string; message?: string };

export async function updateSchedule(campaignId: string, _: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const user = await requireUser();
  const campaign = await requireCampaign(campaignId);
  const parsed = z
    .object({ scheduleEnabled: z.literal('on').optional(), recheckHour: z.coerce.number().int().min(0).max(23) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Geçersiz saat.' };

  await db().campaign.update({
    where: { id: campaign.id },
    data: { scheduleEnabled: parsed.data.scheduleEnabled === 'on', recheckHour: parsed.data.recheckHour },
  });
  await db().auditEvent.create({ data: { action: 'campaign.schedule_updated', actorId: user.id, subject: campaign.id, metadata: parsed.data } });
  revalidatePath(`/campaigns/${campaign.id}`);
  return { message: parsed.data.scheduleEnabled === 'on' ? 'Program açıldı.' : 'Program kapatıldı.' };
}
