import { z } from 'zod';
import { submitResult } from '@/lib/agent';
import { readJson, requireAgent } from '../../../guard';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    leaseToken: z.string().min(1).max(200),
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
    model: z.string().min(1).max(100),
    /** Raw model JSON; the server validates it again. */
    output: z.string().max(20_000).optional(),
    error: z.string().max(500).optional(),
  })
  .refine((b) => b.output !== undefined || b.error !== undefined, 'output veya error gerekli');

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = bodySchema.safeParse(await readJson(request).catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return Response.json({ error: 'bad_request' }, { status: 400 });

  const result = await submitResult(id, auth.agentId, body.data);
  return result.ok ? Response.json({ status: 'accepted' }) : Response.json({ error: result.error }, { status: result.status });
}
