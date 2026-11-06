import { randomUUID } from 'node:crypto';
import { getDb, loadExportableLeads, type PrismaClient } from '@prospectnest/db';
import { SheetsError, syncRows, tabTitleFor, toMachineRow, type SheetsApi } from '@prospectnest/integrations';
import { logger } from '../logger';

const LEASE_MS = 10 * 60 * 1000;

type SyncOptions = { full?: boolean } | null;

/**
 * Sends changed leads of one campaign to its Sheets tab. One writer per tab is
 * enforced with a lease row; outbox entries are marked done only after the
 * Sheets API confirmed the write, so a crash or error simply leaves them pending.
 */
export async function processSyncRun(runId: string, api: SheetsApi, db: PrismaClient = getDb()): Promise<void> {
  const run = await db.run.findUnique({ where: { id: runId }, include: { campaign: { include: { sheetSync: true } } } });
  if (!run || run.status === 'completed' || run.status === 'cancelled' || run.status === 'failed') return;
  const sheetSync = run.campaign.sheetSync;
  if (!sheetSync) {
    await db.run.update({ where: { id: runId }, data: { status: 'failed', error: 'Bu kampanya için Sheets bağlantısı yok.', finishedAt: new Date() } });
    return;
  }

  const owner = randomUUID();
  const now = new Date();
  const lease = await db.sheetSync.updateMany({
    where: { id: sheetSync.id, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockOwner: owner, lockedUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (lease.count === 0) throw new SheetsError('locked');

  await db.run.update({ where: { id: runId }, data: { status: 'running', startedAt: run.startedAt ?? now } });

  try {
    const options = run.options as SyncOptions;
    const pending = await db.syncOutbox.findMany({
      where: { status: { in: ['pending', 'failed'] }, campaignBusiness: { campaignId: run.campaignId } },
      select: { id: true, campaignBusinessId: true },
    });
    const leadIds = options?.full ? undefined : [...new Set(pending.map((p) => p.campaignBusinessId))];
    const { leads, blocked } = await loadExportableLeads(db, run.campaignId, leadIds);

    const result = await syncRows(api, {
      spreadsheetId: sheetSync.spreadsheetId,
      tabTitle: sheetSync.sheetTitle || tabTitleFor(run.campaign.name),
      tabId: sheetSync.sheetTabId,
      rows: leads.map(toMachineRow),
    });

    const finishedAt = new Date();
    await db.$transaction([
      db.syncOutbox.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { status: 'done', processedAt: finishedAt, lastError: null },
      }),
      db.sheetSync.update({
        where: { id: sheetSync.id },
        data: {
          sheetTabId: result.tabId,
          sheetTitle: result.tabTitle,
          lastSyncedAt: finishedAt,
          lastError: null,
          lastResult: { updated: result.updated, appended: result.appended, blocked: blocked.length },
        },
      }),
      db.run.update({
        where: { id: runId },
        data: {
          status: blocked.length > 0 ? 'partial' : 'completed',
          totalItems: leads.length + blocked.length,
          doneItems: leads.length,
          failedItems: blocked.length,
          updatedBusinesses: result.updated,
          newBusinesses: result.appended,
          summary: { blocked: blocked.slice(0, 200) },
          error: blocked.length > 0 ? `${blocked.length} kayıt kaynak politikası nedeniyle aktarılmadı.` : null,
          finishedAt,
        },
      }),
      db.integration.upsert({
        where: { kind: 'google_sheets' },
        create: { kind: 'google_sheets', status: 'healthy', lastCheckedAt: finishedAt, lastSuccessAt: finishedAt },
        update: { status: 'healthy', lastCheckedAt: finishedAt, lastSuccessAt: finishedAt, lastError: null },
      }),
    ]);
    logger.info('sheets aktarımı tamamlandı', { runId, updated: result.updated, appended: result.appended, blocked: blocked.length });
  } catch (error) {
    const sheetsError = error instanceof SheetsError ? error : new SheetsError('unavailable');
    if (!(error instanceof SheetsError)) logger.error('sheets aktarım hatası', { runId, error: String(error) });
    const failedAt = new Date();
    await db.$transaction([
      db.sheetSync.update({ where: { id: sheetSync.id }, data: { lastError: sheetsError.userMessage } }),
      db.run.update({ where: { id: runId }, data: { status: 'failed', error: sheetsError.userMessage, finishedAt: failedAt } }),
      db.integration.upsert({
        where: { kind: 'google_sheets' },
        create: { kind: 'google_sheets', status: 'error', lastCheckedAt: failedAt, lastError: sheetsError.userMessage },
        update: { status: sheetsError.kind === 'credentials' || sheetsError.kind === 'not_found' ? 'error' : undefined, lastCheckedAt: failedAt, lastError: sheetsError.userMessage },
      }),
    ]);
  } finally {
    await db.sheetSync.updateMany({ where: { id: sheetSync.id, lockOwner: owner }, data: { lockOwner: null, lockedUntil: null } });
  }
}
