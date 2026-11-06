import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Liveness for Docker/uptime checks. Exposes no data beyond up/down. */
export async function GET() {
  try {
    await db().$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', database: 'up' });
  } catch {
    return Response.json({ status: 'degraded', database: 'down' }, { status: 503 });
  }
}
