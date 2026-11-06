'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createGoogleSheetsApi, SheetsError, tabTitleFor } from '@prospectnest/integrations';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

export type IntegrationActionState = { error?: string; message?: string };

/** Reads the spreadsheet metadata with the server-side key. Success is reported only after Google answered. */
export async function testSheetsConnection(_: IntegrationActionState): Promise<IntegrationActionState> {
  const user = await requireUser();
  const { GOOGLE_APPLICATION_CREDENTIALS: keyFile, GOOGLE_SPREADSHEET_ID: spreadsheetId } = env();
  if (!keyFile || !spreadsheetId) return { error: 'GOOGLE_APPLICATION_CREDENTIALS ve GOOGLE_SPREADSHEET_ID sunucuda tanımlanmalı.' };

  const now = new Date();
  try {
    const { title } = await createGoogleSheetsApi(keyFile).getTabs(spreadsheetId);
    await db().integration.upsert({
      where: { kind: 'google_sheets' },
      create: { kind: 'google_sheets', status: 'healthy', lastCheckedAt: now, lastSuccessAt: now },
      update: { status: 'healthy', lastCheckedAt: now, lastSuccessAt: now, lastError: null },
    });
    await db().auditEvent.create({ data: { action: 'integration.sheets_tested', actorId: user.id, metadata: { ok: true } } });
    revalidatePath('/integrations');
    return { message: `Bağlantı çalışıyor: "${title}" tablosuna erişildi.` };
  } catch (error) {
    const message = error instanceof SheetsError ? error.userMessage : 'Bağlantı test edilemedi.';
    await db().integration.upsert({
      where: { kind: 'google_sheets' },
      create: { kind: 'google_sheets', status: 'error', lastCheckedAt: now, lastError: message },
      update: { status: 'error', lastCheckedAt: now, lastError: message },
    });
    revalidatePath('/integrations');
    return { error: message };
  }
}

/** Connects the campaign to its own tab (created on first sync) and queues a full sync. */
export async function startSheetSync(campaignId: string, _: IntegrationActionState): Promise<IntegrationActionState> {
  const user = await requireUser();
  const id = z.uuid().parse(campaignId);
  const { GOOGLE_APPLICATION_CREDENTIALS: keyFile, GOOGLE_SPREADSHEET_ID: spreadsheetId } = env();
  if (!keyFile || !spreadsheetId) return { error: 'Google Sheets bağlı değil. CSV olarak indirebilirsiniz.' };

  const campaign = await db().campaign.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!campaign) return { error: 'Kampanya bulunamadı.' };

  const active = await db().run.findFirst({ where: { campaignId: id, kind: 'sync', status: { in: ['queued', 'running'] } }, select: { id: true } });
  if (active) return { error: 'Bu kampanya için bir aktarım zaten sırada.' };

  await db().sheetSync.upsert({
    where: { campaignId: id },
    create: { campaignId: id, spreadsheetId, sheetTitle: tabTitleFor(campaign.name) },
    update: { spreadsheetId },
  });
  const run = await db().run.create({ data: { campaignId: id, kind: 'sync', status: 'queued', options: { full: true } } });
  await db().auditEvent.create({ data: { action: 'sync.queued', actorId: user.id, subject: run.id } });
  redirect(`/runs/${run.id}`);
}
