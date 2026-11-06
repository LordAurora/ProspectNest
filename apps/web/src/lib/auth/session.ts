import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from '@/lib/db';
import { env, isSecureOrigin } from '@/lib/env';

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** `__Host-` binds the cookie to this exact origin, but browsers only accept it over HTTPS. */
export const sessionCookieName = () => (isSecureOrigin() ? '__Host-pn_session' : 'pn_session');

export type SessionUser = { id: string; email: string; name: string | null };

function hashToken(token: string): string {
  return createHmac('sha256', env().SESSION_SECRET).update(token).digest('hex');
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const h = await headers();
  await db().session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ip: await clientIp(),
      userAgent: h.get('user-agent')?.slice(0, 256) ?? null,
    },
  });
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureOrigin(),
    path: '/',
    expires: expiresAt,
  });
}

/** Resolves the signed-in user once per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;

  const session = await db().session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, expiresAt: true, lastSeenAt: true, user: { select: { id: true, email: true, name: true } } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db().session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return session.user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (token) await db().session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(sessionCookieName());
}
