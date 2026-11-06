import 'server-only';
import { cache } from 'react';
import { WORKER_HEARTBEAT_STALE_MS } from '@prospectnest/core';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

export type WorkerState =
  | { status: 'online'; lastBeatAt: Date; hostname: string }
  | { status: 'stale'; lastBeatAt: Date; hostname: string }
  | { status: 'never' };

export const getWorkerState = cache(async (): Promise<WorkerState> => {
  const beat = await db().workerHeartbeat.findFirst({ orderBy: { lastBeatAt: 'desc' } });
  if (!beat) return { status: 'never' };
  const fresh = Date.now() - beat.lastBeatAt.getTime() < WORKER_HEARTBEAT_STALE_MS;
  return { status: fresh ? 'online' : 'stale', lastBeatAt: beat.lastBeatAt, hostname: beat.hostname };
});

/** Demo label is shown when DEMO_MODE is on or any synthetic rows exist, so fake data is never unlabelled. */
export const hasDemoData = cache(async (): Promise<boolean> => {
  if (env().DEMO_MODE) return true;
  return (await db().campaign.count({ where: { isDemo: true } })) > 0;
});

export type IntegrationSummary = {
  key: 'sheets' | 'discovery' | 'ollama';
  name: string;
  state: 'not_configured' | 'configured' | 'healthy' | 'error' | 'disabled';
  detail: string;
  lastSuccessAt?: Date | null;
};

/**
 * Configuration plus the last real health check. An integration is reported
 * as working only after its own check or sync actually succeeded.
 */
export const getIntegrationSummaries = cache(async (): Promise<IntegrationSummary[]> => {
  const e = env();
  const sheetsConfigured = Boolean(e.GOOGLE_APPLICATION_CREDENTIALS && e.GOOGLE_SPREADSHEET_ID);
  const sheetsRow = sheetsConfigured ? await db().integration.findUnique({ where: { kind: 'google_sheets' } }) : null;
  const sheetsState: IntegrationSummary['state'] = !sheetsConfigured
    ? 'not_configured'
    : sheetsRow?.status === 'healthy'
      ? 'healthy'
      : sheetsRow?.status === 'error'
        ? 'error'
        : 'configured';
  const ollamaEnabled = e.AI_MODE === 'local' && Boolean(e.OLLAMA_MODEL);
  const ollamaRow = ollamaEnabled ? await db().integration.findUnique({ where: { kind: 'ollama' } }) : null;
  const ollamaState: IntegrationSummary['state'] =
    e.AI_MODE === 'disabled'
      ? 'disabled'
      : !e.OLLAMA_MODEL
        ? 'not_configured'
        : ollamaRow?.status === 'healthy'
          ? 'healthy'
          : ollamaRow?.status === 'error'
            ? 'error'
            : 'configured';

  return [
    {
      key: 'sheets',
      name: 'Google Sheets',
      state: sheetsState,
      lastSuccessAt: sheetsRow?.lastSuccessAt ?? null,
      detail: !sheetsConfigured
        ? 'Service account anahtarı ve tablo kimliği tanımlı değil. CSV dışa aktarımı kullanılabilir.'
        : sheetsState === 'error'
          ? (sheetsRow?.lastError ?? 'Son bağlantı denemesi başarısız oldu.')
          : sheetsState === 'healthy'
            ? 'Bağlantı doğrulandı.'
            : 'Kimlik bilgisi tanımlı; bağlantı henüz test edilmedi.',
    },
    {
      key: 'discovery',
      name: 'Keşif sağlayıcısı',
      state: e.DISCOVERY_PROVIDER === 'none' ? 'not_configured' : 'configured',
      detail:
        e.DISCOVERY_PROVIDER === 'none'
          ? 'Canlı keşif için bağlantı gerekli. İşletmeler CSV veya manuel olarak eklenir.'
          : `Sağlayıcı: ${e.DISCOVERY_PROVIDER}. Adaptör henüz doğrulanmadı.`,
    },
    {
      key: 'ollama',
      name: 'Yerel model (Ollama)',
      state: ollamaState,
      lastSuccessAt: ollamaRow?.lastSuccessAt ?? null,
      detail:
        e.AI_MODE === 'disabled'
          ? 'Kapalı. Kural puanlaması ve aktarım modelden bağımsız çalışır.'
          : !e.OLLAMA_MODEL
            ? 'AI_MODE=local fakat OLLAMA_MODEL tanımlı değil.'
            : ollamaState === 'healthy'
              ? `Model hazır: ${e.OLLAMA_MODEL}.`
              : ollamaState === 'error'
                ? (ollamaRow?.lastError ?? 'Son kontrol başarısız oldu.')
                : `Model: ${e.OLLAMA_MODEL}. Sağlık kontrolü henüz yapılmadı.`,
    },
  ];
});
