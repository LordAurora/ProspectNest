/**
 * Client for a local Ollama server. It is deliberately separate from the
 * research fetcher: its base URL comes only from server configuration
 * (OLLAMA_BASE_URL), never from user input or scraped pages, and it is the
 * only code path allowed to talk to a loopback/private address.
 */
export type OllamaConfig = {
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

export type FetchLike = (url: string, init: { method: string; headers?: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type OllamaHealth =
  | { status: 'ready'; model: string }
  | { status: 'model_missing'; model: string; available: string[] }
  | { status: 'unreachable'; reason: string };

export class OllamaError extends Error {
  constructor(
    readonly kind: 'unreachable' | 'timeout' | 'model_missing' | 'bad_response',
    message: string,
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class OllamaClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: OllamaConfig,
    private readonly fetcher: FetchLike = fetch as unknown as FetchLike,
  ) {
    const url = new URL(config.baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new OllamaError('unreachable', 'OLLAMA_BASE_URL http veya https olmalı');
    this.baseUrl = url.toString().replace(/\/$/, '');
  }

  get model() {
    return this.config.model;
  }

  private async request(path: string, body?: unknown, timeoutMs = this.config.timeoutMs) {
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json' } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal,
      });
    } catch {
      if (signal.aborted) throw new OllamaError('timeout', 'Yerel model zamanında yanıt vermedi.');
      throw new OllamaError('unreachable', 'Yerel model sunucusuna ulaşılamadı.');
    }
    if (response.status === 404) throw new OllamaError('model_missing', `"${this.config.model}" modeli yüklü değil.`);
    if (!response.ok) throw new OllamaError('bad_response', `Yerel model sunucusu hata döndürdü (${response.status}).`);
    return response.json();
  }

  /** Lists installed models; never triggers a download. */
  async health(): Promise<OllamaHealth> {
    try {
      const body = (await this.request('/api/tags', undefined, 5_000)) as { models?: { name?: string; model?: string }[] };
      const available = (body.models ?? []).map((m) => m.name ?? m.model ?? '').filter(Boolean);
      const wanted = this.config.model;
      const installed = available.some((name) => name === wanted || name === `${wanted}:latest` || name.split(':')[0] === wanted);
      return installed ? { status: 'ready', model: wanted } : { status: 'model_missing', model: wanted, available };
    } catch (error) {
      return { status: 'unreachable', reason: error instanceof Error ? error.message : 'Bilinmeyen hata' };
    }
  }

  /**
   * One non-streaming chat turn constrained to a JSON schema. No tools are
   * offered: the model can only return text, never act.
   */
  async chatJson(messages: ChatMessage[], schema: object): Promise<string> {
    const body = (await this.request('/api/chat', {
      model: this.config.model,
      messages,
      format: schema,
      stream: false,
      options: { temperature: 0 },
    })) as { message?: { content?: unknown } };
    const content = body.message?.content;
    if (typeof content !== 'string') throw new OllamaError('bad_response', 'Yerel model boş yanıt döndürdü.');
    return content;
  }
}
