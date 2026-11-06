'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '@prospectnest/db';
import { LOGIN_FAILED, isLoginThrottled } from '@/lib/auth/rate-limit';
import { clientIp, createSession, destroySession } from '@/lib/auth/session';
import { db } from '@/lib/db';

export type LoginState = { error?: string; email?: string };

const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(512),
  next: z.string().optional(),
});

// Verifying against a real hash when the user does not exist keeps response
// time the same, so the form does not reveal which e-mail is registered.
let dummyHash: Promise<string> | undefined;

/** Only same-origin relative paths are accepted to avoid open redirects. */
function safeNext(value: string | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  const rawEmail = String(formData.get('email') ?? '');
  if (!parsed.success) return { error: 'E-posta ve parolayı kontrol edin.', email: rawEmail };

  const { email, password, next } = parsed.data;
  const ip = await clientIp();

  if (await isLoginThrottled(ip, email)) {
    return { error: 'Çok fazla başarısız deneme. 15 dakika sonra yeniden deneyin.', email };
  }

  const user = await db().user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  dummyHash ??= hashPassword('timing-equalizer-not-a-real-password');
  const valid = await verifyPassword(user?.passwordHash ?? (await dummyHash), password);

  if (!user || !valid) {
    await db().auditEvent.create({ data: { action: LOGIN_FAILED, subject: email, ip } });
    return { error: 'E-posta veya parola hatalı.', email };
  }

  await createSession(user.id);
  await db().auditEvent.create({ data: { action: 'auth.login', actorId: user.id, ip } });
  redirect(safeNext(next));
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect('/login');
}
