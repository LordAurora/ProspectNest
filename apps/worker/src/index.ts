import { randomUUID } from 'node:crypto';
import { PgBoss } from 'pg-boss';
import { QUEUES, workerEnvSchema } from '@prospectnest/core';
import { evaluateCampaignBusiness, getDb } from '@prospectnest/db';
import { startDispatcher, type ResearchJob } from './dispatcher';
import { startHeartbeat } from './heartbeat';
import { PURGE_SESSIONS_JOB, purgeExpiredSessions } from './jobs/maintenance';
import { processResearchRun } from './jobs/research';
import { processSyncRun } from './jobs/sheets';
import { logger } from './logger';
import { createResearcher } from './researcher';
import { createGoogleSheetsApi } from '@prospectnest/integrations';

async function main() {
  const env = workerEnvSchema.parse(process.env);
  const workerId = `${process.pid}-${randomUUID().slice(0, 8)}`;

  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (error) => logger.error('pg-boss hatası', { error: String(error) }));
  await boss.start();

  await boss.createQueue(QUEUES.maintenance);
  await boss.createQueue(QUEUES.research);
  await boss.createQueue(QUEUES.sync);

  // Maintenance jobs share one queue; the job name travels in the payload.
  await boss.schedule(QUEUES.maintenance, '17 * * * *', { job: PURGE_SESSIONS_JOB }, { key: PURGE_SESSIONS_JOB });
  await boss.work<{ job: string }>(QUEUES.maintenance, async ([job]) => {
    if (job?.data.job === PURGE_SESSIONS_JOB) await purgeExpiredSessions();
  });

  const research = createResearcher({ demoMode: env.DEMO_MODE });
  // One run at a time per worker; parallelism happens across businesses inside the run.
  await boss.work<ResearchJob>(QUEUES.research, { batchSize: 1 }, async ([job]) => {
    if (!job) return;
    await processResearchRun(job.data.runId, {
      research,
      concurrency: env.WORKER_CONCURRENCY,
      afterItem: async (campaignBusinessId) => {
        await evaluateCampaignBusiness(getDb(), campaignBusinessId);
      },
    });
  });

  // Sync runs are only created when credentials exist; without them the job fails with a clear message.
  const credentials = env.GOOGLE_APPLICATION_CREDENTIALS;
  await boss.work<ResearchJob>(QUEUES.sync, { batchSize: 1 }, async ([job]) => {
    if (!job) return;
    if (!credentials) {
      await getDb().run.update({
        where: { id: job.data.runId },
        data: { status: 'failed', error: 'Google Sheets kimlik bilgisi tanımlı değil.', finishedAt: new Date() },
      });
      return;
    }
    await processSyncRun(job.data.runId, createGoogleSheetsApi(credentials));
  });

  const stopDispatcher = startDispatcher(boss);
  const stopHeartbeat = startHeartbeat(workerId);
  logger.info('worker başladı', {
    workerId,
    concurrency: env.WORKER_CONCURRENCY,
    aiMode: env.AI_MODE,
    demoMode: env.DEMO_MODE,
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('worker kapanıyor', { signal });
    stopDispatcher();
    stopHeartbeat();
    // Unfinished runs resume from their items when pg-boss retries the job.
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
