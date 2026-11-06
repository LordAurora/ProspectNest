'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAgentToken } from '@/lib/agent';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';

export type AgentTokenState = { error?: string; token?: string };

export async function createAgentTokenAction(_: AgentTokenState, formData: FormData): Promise<AgentTokenState> {
  const user = await requireUser();
  const name = z.string().trim().min(1, 'Bir ad girin').max(60).safeParse(formData.get('name'));
  if (!name.success) return { error: name.error.issues[0]?.message };
  const { token, id } = await createAgentToken(name.data);
  await db().auditEvent.create({ data: { action: 'agent.token_created', actorId: user.id, subject: id } });
  revalidatePath('/settings');
  // Shown once; only its HMAC is stored.
  return { token };
}

export async function revokeAgentToken(id: string): Promise<void> {
  const user = await requireUser();
  const credentialId = z.uuid().parse(id);
  await db().$transaction([
    db().agentCredential.update({ where: { id: credentialId }, data: { revokedAt: new Date() } }),
    // Live leases of a revoked agent end immediately; their jobs return to the pool on the next lease.
    db().aIJobLease.updateMany({ where: { agentId: credentialId, status: 'leased' }, data: { expiresAt: new Date(0) } }),
  ]);
  await db().auditEvent.create({ data: { action: 'agent.token_revoked', actorId: user.id, subject: credentialId } });
  revalidatePath('/settings');
}
