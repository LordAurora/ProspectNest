import 'server-only';
import { db } from '@/lib/db';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 10;
const MAX_FAILURES_PER_EMAIL = 5;

export const LOGIN_FAILED = 'auth.login_failed';

/**
 * Failed attempts are already audit events, so the limiter reads them back
 * instead of keeping separate in-memory state that would reset on restart.
 */
export async function isLoginThrottled(ip: string | null, email: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    db().auditEvent.count({ where: { action: LOGIN_FAILED, subject: email, createdAt: { gte: since } } }),
    ip ? db().auditEvent.count({ where: { action: LOGIN_FAILED, ip, createdAt: { gte: since } } }) : 0,
  ]);
  return byEmail >= MAX_FAILURES_PER_EMAIL || byIp >= MAX_FAILURES_PER_IP;
}
