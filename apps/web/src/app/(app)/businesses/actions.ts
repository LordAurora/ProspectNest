'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { LEAD_STATUSES } from '@prospectnest/core';
import { Prisma } from '@prospectnest/db';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';

export type LeadActionState = { error?: string; message?: string };

export async function updateLeadStatus(leadId: string, status: string): Promise<LeadActionState> {
  const user = await requireUser();
  const id = z.uuid().parse(leadId);
  const parsed = z.enum(LEAD_STATUSES).safeParse(status);
  if (!parsed.success) return { error: 'Geçersiz durum.' };
  await db().campaignBusiness.update({ where: { id }, data: { status: parsed.data } });
  await db().auditEvent.create({ data: { action: 'lead.status_changed', actorId: user.id, subject: id, metadata: { status: parsed.data } } });
  revalidatePath('/businesses');
  return { message: 'Durum güncellendi.' };
}

export async function saveLeadNotes(leadId: string, _: LeadActionState, formData: FormData): Promise<LeadActionState> {
  await requireUser();
  const id = z.uuid().parse(leadId);
  const notes = z.string().max(5000, 'Not en fazla 5000 karakter olabilir').safeParse(String(formData.get('notes') ?? ''));
  if (!notes.success) return { error: notes.error.issues[0]?.message };
  await db().campaignBusiness.update({ where: { id }, data: { notes: notes.data.trim() || null } });
  revalidatePath(`/businesses/${id}`);
  return { message: 'Not kaydedildi.' };
}

const bulkSchema = z.object({
  leadIds: z.array(z.uuid()).min(1).max(500),
});

export async function bulkUpdateStatus(leadIds: string[], status: string): Promise<LeadActionState> {
  const user = await requireUser();
  const parsed = bulkSchema.safeParse({ leadIds });
  const target = z.enum(LEAD_STATUSES).safeParse(status);
  if (!parsed.success || !target.success) return { error: 'Geçersiz seçim.' };
  const { count } = await db().campaignBusiness.updateMany({ where: { id: { in: parsed.data.leadIds } }, data: { status: target.data } });
  await db().auditEvent.create({ data: { action: 'lead.bulk_status', actorId: user.id, metadata: { count, status: target.data } } });
  revalidatePath('/businesses');
  return { message: `${count} işletmenin durumu güncellendi.` };
}

/** Queues a research run limited to the selected leads; they must belong to one campaign. */
export async function bulkResearch(leadIds: string[]): Promise<LeadActionState & { runId?: string }> {
  const user = await requireUser();
  const parsed = bulkSchema.safeParse({ leadIds });
  if (!parsed.success) return { error: 'Geçersiz seçim.' };
  const leads = await db().campaignBusiness.findMany({
    where: { id: { in: parsed.data.leadIds } },
    select: { campaignId: true, businessId: true },
  });
  const campaigns = new Set(leads.map((l) => l.campaignId));
  if (campaigns.size !== 1) return { error: 'Toplu araştırma için önce tek bir kampanya seçin.' };
  const [campaignId] = [...campaigns] as [string];

  try {
    const run = await db().run.create({
      data: { campaignId, kind: 'research', status: 'queued', options: { businessIds: leads.map((l) => l.businessId) } },
    });
    await db().auditEvent.create({ data: { action: 'run.queued', actorId: user.id, subject: run.id } });
    revalidatePath('/runs');
    return { runId: run.id, message: 'Araştırma sıraya alındı.' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'Bu kampanya için zaten bir araştırma sürüyor.' };
    }
    throw error;
  }
}
