import { leaseNextJob } from '@/lib/agent';
import { requireAgent } from '../../guard';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireAgent(request);
  if (auth instanceof Response) return auth;
  const job = await leaseNextJob(auth.agentId);
  return job ? Response.json(job) : new Response(null, { status: 204 });
}
