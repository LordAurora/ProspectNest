'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Prisma } from '@prospectnest/db';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';

export type RunActionState = { error?: string };

const ACTIVE_CONFLICT = 'Bu kampanya için zaten bir araştırma sürüyor. Bitmesini bekleyin veya iptal edin.';

/**
 * Only records a queued run. The worker picks it up; the request returns
 * immediately and the run continues even if this tab is closed.
 */
async function enqueueResearch(campaignId: string, actorId: string, businessIds?: string[]): Promise<string | RunActionState> {
  const campaign = await db().campaign.findUnique({ where: { id: campaignId }, select: { id: true, archivedAt: true } });
  if (!campaign || campaign.archivedAt) return { error: 'Kampanya bulunamadı.' };

  const total = await db().campaignBusiness.count({ where: { campaignId } });
  if (total === 0) return { error: 'Araştırılacak işletme yok. Önce CSV yükleyin veya işletme ekleyin.' };

  try {
    const run = await db().run.create({
      data: { campaignId, kind: 'research', status: 'queued', ...(businessIds ? { options: { businessIds } } : {}) },
    });
    await db().auditEvent.create({ data: { action: 'run.queued', actorId, subject: run.id } });
    return run.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { error: ACTIVE_CONFLICT };
    throw error;
  }
}

export async function startResearch(campaignId: string, _: RunActionState): Promise<RunActionState> {
  const user = await requireUser();
  const id = z.uuid().parse(campaignId);
  const result = await enqueueResearch(id, user.id);
  if (typeof result !== 'string') return result;
  revalidatePath(`/campaigns/${id}`);
  redirect(`/runs/${result}`);
}

export async function cancelRun(runId: string, _: RunActionState): Promise<RunActionState> {
  const user = await requireUser();
  const id = z.uuid().parse(runId);
  const run = await db().run.findUnique({ where: { id }, select: { status: true } });
  if (!run) return { error: 'Çalışma bulunamadı.' };
  if (run.status !== 'queued' && run.status !== 'running') return { error: 'Bu çalışma zaten bitmiş.' };

  // A queued run that no worker has claimed can be cancelled directly; a running one stops at the next safe point.
  const direct = await db().run.updateMany({
    where: { id, status: 'queued', dispatchedAt: null },
    data: { status: 'cancelled', cancelRequested: true, finishedAt: new Date(), error: 'Kullanıcı tarafından iptal edildi.' },
  });
  if (direct.count === 0) await db().run.update({ where: { id }, data: { cancelRequested: true } });

  await db().auditEvent.create({ data: { action: 'run.cancel_requested', actorId: user.id, subject: id } });
  revalidatePath(`/runs/${id}`);
  return {};
}

/** Starts a new run limited to the items that failed or were not reached. */
export async function retryRun(runId: string, _: RunActionState): Promise<RunActionState> {
  const user = await requireUser();
  const id = z.uuid().parse(runId);
  const run = await db().run.findUnique({ where: { id }, select: { campaignId: true, status: true, kind: true } });
  if (!run) return { error: 'Çalışma bulunamadı.' };
  if (run.kind !== 'research' && run.kind !== 'recheck') return { error: 'Bu tür çalışma yeniden denenemez.' };

  const items = await db().runItem.findMany({
    where: { runId: id, status: { in: ['failed', 'pending', 'running'] }, businessId: { not: null } },
    select: { businessId: true },
  });
  const businessIds = items.flatMap((i) => (i.businessId ? [i.businessId] : []));
  if (businessIds.length === 0) return { error: 'Yeniden denenecek işletme yok.' };

  const result = await enqueueResearch(run.campaignId, user.id, businessIds);
  if (typeof result !== 'string') return result;
  redirect(`/runs/${result}`);
}
