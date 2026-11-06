import { randomUUID } from 'node:crypto';
import { PgBoss } from 'pg-boss';
import { QUEUES, workerEnvSchema } from '@prospectnest/core';
import { getDb } from '@prospectnest/db';
import { startHeartbeat } from './heartbeat';
import { PURGE_SESSIONS_JOB, purgeExpiredSessions } from './jobs/maintenance';
import { logger } from './logger';

async function main() {
  const env = workerEnvSchema.parse(process.env);
  const workerId = `${process.pid}-${randomUUID().slice(0, 8)}`;

  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (error) => logger.error('pg-boss hatası', { error: String(error) }));
  await boss.start();

  await boss.createQueue(QUEUES.maintenance);
  await boss.createQueue(QUEUES.research);

  // Maintenance jobs share one queue; the job name travels in the payload.
  await boss.schedule(QUEUES.maintenance, '17 * * * *', { job: PURGE_SESSIONS_JOB }, { key: PURGE_SESSIONS_JOB });
  await boss.work<{ job: string }>(QUEUES.maintenance, async ([job]) => {
    if (job?.data.job === PURGE_SESSIONS_JOB) await purgeExpiredSessions();
  });

  // Research handlers arrive in phase 3; the queue already exists so the web
  // app can enqueue runs and they wait durably instead of failing.

  const stopHeartbeat = startHeartbeat(workerId);
  logger.info('worker başladı', { workerId, concurrency: env.WORKER_CONCURRENCY, aiMode: env.AI_MODE });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('worker kapanıyor', { signal });
    stopHeartbeat();
    await boss.stop({ graceful: true, timeout: 20_000 });
    await getDb().$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error('worker başlatılamadı', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
