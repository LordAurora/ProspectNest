import 'server-only';
import { cache } from 'react';
import { WORKER_HEARTBEAT_STALE_MS } from '@prospectnest/core';
import { resolveDiscoveryProvider } from '@prospectnest/providers';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { formatRelative } from '@/lib/format';

/** An agent polling at least every few minutes counts as connected. */
const AGENT_ONLINE_MS = 10 * 60 * 1000;

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
  const lastAgent =
    e.AI_MODE === 'agent'
      ? await db().agentCredential.findFirst({ where: { revokedAt: null }, orderBy: { lastUsedAt: { sort: 'desc', nulls: 'last' } }, select: { lastUsedAt: true } })
      : null;
  const discovery = discoveryStatus();
  const lastDiscovery =
    discovery.status === 'ready'
      ? await db().run.findFirst({ where: { kind: 'discovery', status: { in: ['completed', 'failed'] } }, orderBy: { createdAt: 'desc' }, select: { status: true, finishedAt: true, error: true } })
      : null;
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
      state: discovery.status === 'ready' ? (lastDiscovery?.status === 'completed' ? 'healthy' : lastDiscovery?.status === 'failed' ? 'error' : 'configured') : 'not_configured',
      lastSuccessAt: lastDiscovery?.status === 'completed' ? lastDiscovery.finishedAt : null,
      detail:
        discovery.status !== 'ready'
          ? `${discovery.reason} İşletmeler CSV veya manuel olarak eklenebilir.`
          : lastDiscovery?.status === 'failed'
            ? (lastDiscovery.error ?? 'Son arama başarısız oldu.')
            : `${discovery.provider.name}: yalnız place_id saklanır; ayrıntılar gösterim anında canlı alınır ve dışa aktarılmaz. Günlük istek sınırı ${e.GOOGLE_PLACES_DAILY_REQUEST_LIMIT}.`,
    },
    {
      key: 'ollama',
      name: 'Yerel model (Ollama)',
      state: e.AI_MODE === 'agent' ? (lastAgent?.lastUsedAt && Date.now() - lastAgent.lastUsedAt.getTime() < AGENT_ONLINE_MS ? 'healthy' : 'configured') : ollamaState,
      lastSuccessAt: e.AI_MODE === 'agent' ? (lastAgent?.lastUsedAt ?? null) : (ollamaRow?.lastSuccessAt ?? null),
      detail:
        e.AI_MODE === 'agent'
          ? lastAgent?.lastUsedAt
            ? `Hibrit mod: AI işlerini bilgisayarınızdaki agent alır. Son bağlantı ${formatRelative(lastAgent.lastUsedAt)}.`
            : 'Hibrit mod: henüz bir agent bağlanmadı. Ayarlar sayfasından agent token oluşturun.'
          : e.AI_MODE === 'disabled'
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

/** Discovery source with its credentials checked; "ready" only when the key is present. */
export const discoveryStatus = () => {
  const e = env();
  return resolveDiscoveryProvider(e.DISCOVERY_PROVIDER, { googlePlacesApiKey: e.GOOGLE_PLACES_API_KEY });
};
