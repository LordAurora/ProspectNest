import 'server-only';
import { authenticateAgent } from '@/lib/agent';
import { env } from '@/lib/env';

/**
 * Shared gate for /api/agent/*: hybrid mode must be on and the bearer token
 * must belong to a non-revoked agent. These routes are not cookie-based, so
 * they are not exposed to CSRF; the token is scoped to AI jobs only.
 */
export async function requireAgent(request: Request): Promise<{ agentId: string } | Response> {
  if (env().AI_MODE !== 'agent') return Response.json({ error: 'agent_mode_disabled' }, { status: 409 });
  const agent = await authenticateAgent(request);
  if (!agent) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return { agentId: agent.id };
}

export async function readJson(request: Request, maxBytes = 64_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('payload_too_large');
  return text ? (JSON.parse(text) as unknown) : {};
}
