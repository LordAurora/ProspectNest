import type { PgBoss } from 'pg-boss';
import { QUEUES } from '@prospectnest/core';
import { getDb } from '@prospectnest/db';
import { logger } from './logger';

const POLL_MS = 3_000;

export type ResearchJob = { runId: string };

/**
 * The web app only writes `queued` runs to the database; this loop claims them
 * with SKIP LOCKED (so several workers never double-dispatch) and hands them
 * to pg-boss, which owns retries and crash recovery from there.
 */
export function startDispatcher(boss: PgBoss): () => void {
  const db = getDb();
  let stopped = false;

  const tick = async () => {
    try {
      const claimed = await db.$queryRaw<{ id: string }[]>`
        UPDATE "Run" SET "dispatchedAt" = now()
        WHERE id IN (
          SELECT id FROM "Run"
          WHERE status = 'queued' AND "dispatchedAt" IS NULL AND kind IN ('research', 'recheck')
          ORDER BY "createdAt"
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id`;
      for (const { id } of claimed) {
        try {
          await boss.send(QUEUES.research, { runId: id } satisfies ResearchJob, {
            singletonKey: id,
            retryLimit: 3,
            retryDelay: 60,
            retryBackoff: true,
            expireInSeconds: 6 * 60 * 60,
          });
        } catch (error) {
          await db.run.update({ where: { id }, data: { dispatchedAt: null } });
          logger.warn('çalışma kuyruğa alınamadı', { runId: id, error: String(error) });
        }
      }
    } catch (error) {
      logger.warn('dispatcher hatası', { error: String(error) });
    } finally {
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    }
  };

  let timer = setTimeout(tick, 500);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
