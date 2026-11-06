import { getDb } from '@prospectnest/db';
import { logger } from '../logger';

export const PURGE_SESSIONS_JOB = 'purge-expired-sessions';

export async function purgeExpiredSessions(): Promise<void> {
  const { count } = await getDb().session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  if (count > 0) logger.info('süresi dolan oturumlar silindi', { count });
}
