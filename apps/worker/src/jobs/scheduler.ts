import { planSlots } from '@prospectnest/core';
import { getDb, Prisma, type PrismaClient } from '@prospectnest/db';
import { logger } from '../logger';

export const SCHEDULER_JOB = 'plan-scheduled-runs';

/**
 * Runs every minute (pg-boss cron, so only one worker executes each tick).
 * For each scheduled campaign it creates at most one recheck run per local
 * day, limited to businesses whose evidence is older than the interval.
 * The (campaignId, scheduledSlot) unique key absorbs races between
 * schedulers, and the one-active-run index skips campaigns already running.
 */
export async function planScheduledRuns(db: PrismaClient = getDb(), now: Date = new Date()): Promise<number> {
  const campaigns = await db.campaign.findMany({
    where: { scheduleEnabled: true, archivedAt: null, isDemo: false },
    select: { id: true, timezone: true, scheduleEnabled: true, recheckHour: true, recheckIntervalDays: true, dailyPageBudget: true },
  });

  let created = 0;
  for (const campaign of campaigns) {
    for (const plan of planSlots(campaign, now)) {
      const exists = await db.run.findUnique({
        where: { campaignId_scheduledSlot: { campaignId: campaign.id, scheduledSlot: plan.slot } },
        select: { id: true },
      });
      if (exists) continue;

      const due = await db.campaignBusiness.findMany({
        where: {
          campaignId: campaign.id,
          business: { website: { not: null }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: plan.dueBefore } }] },
        },
        select: { businessId: true },
        orderBy: { business: { lastCheckedAt: { sort: 'asc', nulls: 'first' } } },
        // Each business costs up to ~5 pages; the run itself also stops at the budget.
        take: Math.max(1, Math.floor(campaign.dailyPageBudget / 5)),
      });
      if (due.length === 0) continue;

      try {
        await db.run.create({
          data: {
            campaignId: campaign.id,
            kind: 'recheck',
            status: 'queued',
            scheduledSlot: plan.slot,
            options: { businessIds: due.map((d) => d.businessId) },
          },
        });
        created += 1;
      } catch (error) {
        // Another scheduler won the slot, or a run is already active for this campaign.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
  }
  if (created > 0) logger.info('zamanlanmış çalışmalar oluşturuldu', { created });
  return created;
}
