'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from '@prospectnest/db';
import { createAgentToken } from '@/lib/agent';
import { isLoginThrottled, LOGIN_FAILED } from '@/lib/auth/rate-limit';
import { clientIp, currentSessionId, requireUser } from '@/lib/auth/session';
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

export type PasswordState = { error?: string; message?: string; fieldErrors?: Record<string, string> };

/** Verifies the current password, stores a new argon2id hash and signs out every other session. */
export async function changePassword(_: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireUser();
  const parsed = z
    .object({
      current: z.string().min(1, 'Mevcut parolayı girin'),
      next: z.string().min(MIN_PASSWORD_LENGTH, `Yeni parola en az ${MIN_PASSWORD_LENGTH} karakter olmalı`).max(256),
      confirm: z.string(),
    })
    .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'Parolalar eşleşmiyor' })
    .refine((v) => v.next !== v.current, { path: ['next'], message: 'Yeni parola mevcut paroladan farklı olmalı' })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }

  const ip = await clientIp();
  if (await isLoginThrottled(ip, user.email)) return { error: 'Çok fazla hatalı deneme. 15 dakika sonra yeniden deneyin.' };

  const record = await db().user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(record.passwordHash, parsed.data.current))) {
    await db().auditEvent.create({ data: { action: LOGIN_FAILED, subject: user.email, ip, metadata: { context: 'password_change' } } });
    return { fieldErrors: { current: 'Mevcut parola hatalı' } };
  }

  const passwordHash = await hashPassword(parsed.data.next);
  const currentSession = await currentSessionId();
  await db().$transaction([
    db().user.update({ where: { id: user.id }, data: { passwordHash } }),
    db().session.deleteMany({ where: { userId: user.id, ...(currentSession ? { id: { not: currentSession } } : {}) } }),
    db().auditEvent.create({ data: { action: 'auth.password_changed', actorId: user.id, ip } }),
  ]);
  revalidatePath('/settings');
  return { message: 'Parola değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.' };
}
