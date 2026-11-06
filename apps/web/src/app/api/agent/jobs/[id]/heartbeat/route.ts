import { z } from 'zod';
import { heartbeat } from '@/lib/agent';
import { readJson, requireAgent } from '../../../guard';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ leaseToken: z.string().min(1).max(200) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = bodySchema.safeParse(await readJson(request).catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return Response.json({ error: 'bad_request' }, { status: 400 });

  const result = await heartbeat(id, auth.agentId, body.data.leaseToken);
  return result.ok ? Response.json({ expiresAt: result.expiresAt }) : Response.json({ error: result.error }, { status: result.status });
}
