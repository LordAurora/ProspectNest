import os from 'node:os';
import { WORKER_HEARTBEAT_INTERVAL_MS } from '@prospectnest/core';
import { getDb } from '@prospectnest/db';
import { logger } from './logger';

export const WORKER_VERSION = '0.1.0';

/** Writes a liveness row the web app reads to show "worker çalışıyor / yanıt vermiyor". */
export function startHeartbeat(workerId: string): () => void {
  const db = getDb();
  const startedAt = new Date();
  const hostname = os.hostname();

  const beat = async () => {
    const now = new Date();
    try {
      await db.workerHeartbeat.upsert({
        where: { workerId },
        create: { workerId, hostname, version: WORKER_VERSION, startedAt, lastBeatAt: now },
        update: { lastBeatAt: now },
      });
    } catch (error) {
      logger.warn('heartbeat yazılamadı', { error: String(error) });
    }
  };

  void beat();
  const timer = setInterval(beat, WORKER_HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
