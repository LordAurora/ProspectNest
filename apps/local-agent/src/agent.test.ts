import { describe, expect, it, vi } from 'vitest';
import { OllamaClient, type FetchLike } from '@prospectnest/integrations';
import { runCycle, validateServerUrl, type AgentDeps, type HttpPost } from './agent';

const job = {
  jobId: '7b1c7d4e-0000-4000-8000-000000000001',
  leaseToken: 'lease-secret',
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
  evidenceHash: 'a'.repeat(64),
  promptVersion: 'analysis-v1',
  input: {
    serviceDescription: 'QR menü',
    serviceLabel: 'QR menü',
    businessName: 'Lavanta',
    evidence: [{ id: 'e1', signal: 'pdf_or_image_menu', status: 'present', excerpt: 'PDF menü', sourceUrl: 'https://l.example/menu' }],
    rule: { score: 65, priority: 'high', coverage: 1, results: [] },
  },
};

const answer = { summary: 'PDF menü var.', assessment: 'potential_fit', evidenceIds: ['e1'], uncertainties: [], suggestedNextStep: 'Arayın.' };

function ollama(content: string) {
  const fetcher: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ message: { content } }) });
  return new OllamaClient({ baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:3b', timeoutMs: 1_000 }, fetcher);
}

function server(responses: Record<string, { status: number; body?: unknown }>) {
  const calls: { path: string; body: Record<string, unknown>; auth: string | undefined }[] = [];
  const post: HttpPost = vi.fn(async (url, init) => {
    const path = url.replace('https://srv.example/api/agent/jobs', '');
    calls.push({ path, body: JSON.parse(init.body) as Record<string, unknown>, auth: init.headers.authorization });
    const key = Object.keys(responses).find((k) => path.endsWith(k)) ?? '';
    const response = responses[key] ?? { status: 500 };
    return { status: response.status, json: async () => response.body };
  });
  return { post, calls };
}

const deps = (post: HttpPost, content = JSON.stringify(answer)): AgentDeps => ({
  serverUrl: 'https://srv.example',
  token: 'pna_test',
  ollama: ollama(content),
  post,
  sleep: async () => undefined,
  log: () => undefined,
});

describe('runCycle', () => {
  it('leases, analyses locally and submits the result with lease proof', async () => {
    const { post, calls } = server({ '/lease': { status: 200, body: job }, '/result': { status: 200 } });
    await expect(runCycle(deps(post))).resolves.toBe('done');
    const result = calls.find((c) => c.path.endsWith('/result'));
    expect(result?.auth).toBe('Bearer pna_test');
    expect(result?.body).toMatchObject({ leaseToken: 'lease-secret', evidenceHash: job.evidenceHash, model: 'qwen2.5:3b' });
    expect(JSON.parse(String(result?.body.output))).toMatchObject({ evidenceIds: ['e1'] });
  });

  it('reports a model failure instead of inventing an answer', async () => {
    const { post, calls } = server({ '/lease': { status: 200, body: job }, '/result': { status: 422 } });
    await expect(runCycle(deps(post, 'not json'))).resolves.toBe('rejected');
    expect(calls.find((c) => c.path.endsWith('/result'))?.body).toHaveProperty('error');
  });

  it('idles when there is no work and stops on a revoked token', async () => {
    expect(await runCycle(deps(server({ '/lease': { status: 204 } }).post))).toBe('idle');
    expect(await runCycle(deps(server({ '/lease': { status: 401 } }).post))).toBe('stop');
  });
});

describe('validateServerUrl', () => {
  it('requires https except on loopback', () => {
    expect(validateServerUrl('https://srv.example/')).toBe('https://srv.example');
    expect(validateServerUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(() => validateServerUrl('http://srv.example')).toThrow();
  });
});
