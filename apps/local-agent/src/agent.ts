import { analyze, AnalysisError, OllamaError, type AnalysisInput, type OllamaClient } from '@prospectnest/integrations';

export type LeasedJob = {
  jobId: string;
  leaseToken: string;
  expiresAt: string;
  evidenceHash: string;
  promptVersion: string;
  input: AnalysisInput;
};

type HttpResponse = { status: number; json(): Promise<unknown> };
export type HttpPost = (url: string, init: { headers: Record<string, string>; body: string }) => Promise<HttpResponse>;

export type AgentDeps = {
  serverUrl: string;
  token: string;
  ollama: OllamaClient;
  post: HttpPost;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
  idleMs?: number;
  heartbeatMs?: number;
};

export type CycleResult = 'idle' | 'done' | 'rejected' | 'stop' | 'disabled';

/**
 * Only http(s) servers are accepted, and plain http only for loopback
 * development: the token must never cross the internet unencrypted.
 */
export function validateServerUrl(raw: string): string {
  const url = new URL(raw);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('SERVER_URL https olmalı (yalnız localhost için http kabul edilir).');
  }
  return url.toString().replace(/\/$/, '');
}

/**
 * One lease → analyse → submit cycle. The agent only ever calls the server's
 * three AI endpoints and the local Ollama API; it executes nothing it receives.
 */
export async function runCycle(deps: AgentDeps): Promise<CycleResult> {
  const headers = { authorization: `Bearer ${deps.token}`, 'content-type': 'application/json' };
  const post = (path: string, body: unknown) => deps.post(`${deps.serverUrl}/api/agent/jobs${path}`, { headers, body: JSON.stringify(body) });

  const leased = await post('/lease', {});
  if (leased.status === 204) return 'idle';
  if (leased.status === 401) {
    deps.log('Token geçersiz veya iptal edilmiş. Ayarlar sayfasından yeni token oluşturun.');
    return 'stop';
  }
  if (leased.status === 409) {
    deps.log('Sunucuda hibrit mod kapalı (AI_MODE=agent değil).');
    return 'disabled';
  }
  if (leased.status !== 200) throw new Error(`Kiralama başarısız (${leased.status})`);
  const job = (await leased.json()) as LeasedJob;

  // Keep the lease alive while the model works; a lost lease means our result would be discarded anyway.
  let leaseLost = false;
  const heartbeat = setInterval(() => {
    void post(`/${job.jobId}/heartbeat`, { leaseToken: job.leaseToken })
      .then((res) => {
        if (res.status !== 200) leaseLost = true;
      })
      .catch(() => undefined);
  }, deps.heartbeatMs ?? 60_000);

  let body: Record<string, string>;
  try {
    const output = await analyze(deps.ollama, job.input);
    body = { output: JSON.stringify(output) };
  } catch (error) {
    if (!(error instanceof AnalysisError || error instanceof OllamaError)) throw error;
    body = { error: error.message };
  } finally {
    clearInterval(heartbeat);
  }

  if (leaseLost) {
    deps.log(`İş ${job.jobId}: kira süresi doldu, sonuç gönderilmedi.`);
    return 'rejected';
  }
  const submitted = await post(`/${job.jobId}/result`, { leaseToken: job.leaseToken, evidenceHash: job.evidenceHash, model: deps.ollama.model, ...body });
  if (submitted.status === 200) {
    deps.log(`İş ${job.jobId}: ${body.output ? 'yorum gönderildi' : 'hata bildirildi'}.`);
    return 'done';
  }
  deps.log(`İş ${job.jobId}: sunucu sonucu kabul etmedi (${submitted.status}).`);
  return 'rejected';
}

export async function runAgent(deps: AgentDeps, signal: AbortSignal): Promise<void> {
  const health = await deps.ollama.health();
  if (health.status === 'model_missing') {
    deps.log(`"${health.model}" yüklü değil. "ollama pull ${health.model}" ile kurun; agent otomatik indirmez.`);
  } else if (health.status === 'unreachable') {
    deps.log(`Ollama'ya ulaşılamadı: ${health.reason}`);
  }

  while (!signal.aborted) {
    let result: CycleResult;
    try {
      result = await runCycle(deps);
    } catch (error) {
      deps.log(`Bağlantı hatası: ${error instanceof Error ? error.message : String(error)}`);
      result = 'idle';
    }
    if (result === 'stop') return;
    if (result !== 'done') await deps.sleep(result === 'disabled' ? 60_000 : (deps.idleMs ?? 15_000));
  }
}
