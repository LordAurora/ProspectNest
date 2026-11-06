import { z } from 'zod';
import { OllamaClient } from '@prospectnest/integrations';
import { runAgent, validateServerUrl, type HttpPost } from './agent';

const envSchema = z.object({
  SERVER_URL: z.string().min(1, 'SERVER_URL gerekli'),
  AGENT_TOKEN: z.string().startsWith('pna_', 'AGENT_TOKEN ayarlar sayfasından oluşturulmalı'),
  // The agent talks to Ollama on this computer; never expose that port to the internet.
  OLLAMA_BASE_URL: z.url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().min(1, 'OLLAMA_MODEL gerekli'),
});

const log = (message: string) => console.log(`[${new Date().toISOString()}] ${message}`);

const post: HttpPost = async (url, init) => {
  const response = await fetch(url, { method: 'POST', headers: init.headers, body: init.body, signal: AbortSignal.timeout(30_000) });
  return { status: response.status, json: () => response.json() };
};

async function main() {
  const env = envSchema.parse(process.env);
  const serverUrl = validateServerUrl(env.SERVER_URL);
  const ollama = new OllamaClient({ baseUrl: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL, timeoutMs: 180_000 });

  const controller = new AbortController();
  process.on('SIGINT', () => controller.abort());
  process.on('SIGTERM', () => controller.abort());

  log(`Agent başladı: ${serverUrl} · model ${env.OLLAMA_MODEL}`);
  await runAgent(
    { serverUrl, token: env.AGENT_TOKEN, ollama, post, log, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
    controller.signal,
  );
  log('Agent durdu.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
