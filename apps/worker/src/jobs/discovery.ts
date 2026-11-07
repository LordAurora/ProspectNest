import { startOfDayInTimeZone } from '@prospectnest/core';
import { getDb, type PrismaClient } from '@prospectnest/db';
import { PlacesError, type PlacesClient } from '@prospectnest/integrations';
import { logger } from '../logger';

export type DiscoveryOptions = { textQuery: string; regionCode?: string; maxResults: number };

/**
 * Runs one Google Places discovery. Only place IDs are written; each page is
 * committed as it arrives so progress is visible and a crash keeps what was
 * found. The (campaignId, placeId) key makes re-runs idempotent. Billable
 * requests are counted on the run and checked against a daily cap first.
 */
export async function processDiscoveryRun(
  runId: string,
  client: PlacesClient,
  dailyRequestLimit: number,
  db: PrismaClient = getDb(),
): Promise<void> {
  const run = await db.run.findUnique({ where: { id: runId }, include: { campaign: { select: { timezone: true } } } });
  if (!run || run.kind !== 'discovery' || ['completed', 'failed', 'cancelled'].includes(run.status)) return;
  const options = run.options as DiscoveryOptions | null;
  if (!options?.textQuery) {
    await db.run.update({ where: { id: runId }, data: { status: 'failed', error: 'Arama sorgusu eksik.', finishedAt: new Date() } });
    return;
  }
  if (run.cancelRequested) {
    await db.run.update({ where: { id: runId }, data: { status: 'cancelled', finishedAt: new Date() } });
    return;
  }

  await db.run.update({ where: { id: runId }, data: { status: 'running', startedAt: run.startedAt ?? new Date(), error: null } });
  const controller = new AbortController();
  let position = await db.discoveredPlace.count({ where: { runId } });

  const beforeRequest = async () => {
    const fresh = await db.run.findUniqueOrThrow({ where: { id: runId }, select: { cancelRequested: true } });
    if (fresh.cancelRequested) {
      controller.abort();
      throw new PlacesError('cancelled');
    }
    // The cap is global: Places is billed per project, not per campaign.
    const used = await db.run.aggregate({
      _sum: { apiRequests: true },
      where: { kind: 'discovery', updatedAt: { gte: startOfDayInTimeZone(new Date(), run.campaign.timezone) } },
    });
    if ((used._sum.apiRequests ?? 0) >= dailyRequestLimit) throw new PlacesError('quota');
    await db.run.update({ where: { id: runId }, data: { apiRequests: { increment: 1 } } });
  };

  const onPage = async (placeIds: string[]) => {
    const created = await db.discoveredPlace.createMany({
      data: placeIds.map((placeId) => ({ campaignId: run.campaignId, runId, placeId, position: position++ })),
      skipDuplicates: true,
    });
    await db.run.update({
      where: { id: runId },
      data: {
        totalItems: { increment: placeIds.length },
        doneItems: { increment: placeIds.length },
        newBusinesses: { increment: created.count },
        updatedBusinesses: { increment: placeIds.length - created.count },
      },
    });
  };

  try {
    await client.discover(
      { textQuery: options.textQuery, ...(options.regionCode ? { regionCode: options.regionCode } : {}) },
      { maxResults: options.maxResults, signal: controller.signal, beforeRequest, onPage },
    );
    const final = await db.run.findUniqueOrThrow({ where: { id: runId }, select: { totalItems: true } });
    await db.run.update({
      where: { id: runId },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        error: final.totalItems === 0 ? 'Google Places bu sorgu için sonuç döndürmedi.' : null,
      },
    });
  } catch (error) {
    const placesError = error instanceof PlacesError ? error : null;
    if (!placesError) logger.error('keşif hatası', { runId, error: String(error) });
    const found = await db.discoveredPlace.count({ where: { runId } });
    await db.run.update({
      where: { id: runId },
      data: {
        status: placesError?.kind === 'cancelled' ? 'cancelled' : found > 0 ? 'partial' : 'failed',
        error: placesError?.message ?? 'Keşif tamamlanamadı.',
        finishedAt: new Date(),
      },
    });
  }
}
