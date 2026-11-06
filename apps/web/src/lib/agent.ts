import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { buildAnalysisInput, enqueueSheetChange, type AiInput } from '@prospectnest/db';
import { evidenceHash, PROMPT_VERSION, validateAnalysis } from '@prospectnest/integrations';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

export const LEASE_MS = 5 * 60 * 1000;
const TOKEN_PREFIX = 'pna_';

function hmac(value: string): string {
  return createHmac('sha256', env().SESSION_SECRET).update(value).digest('hex');
}

/** Returns the raw token once; only its HMAC is stored. */
export async function createAgentToken(name: string): Promise<{ token: string; id: string }> {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  const credential = await db().agentCredential.create({
    data: { name, prefix: token.slice(0, TOKEN_PREFIX.length + 6), tokenHash: hmac(token) },
  });
  return { token, id: credential.id };
}

/** Bearer token check for /api/agent/*; revoked tokens are rejected. */
export async function authenticateAgent(request: Request): Promise<{ id: string } | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const credential = await db().agentCredential.findUnique({ where: { tokenHash: hmac(token) }, select: { id: true, revokedAt: true } });
  if (!credential || credential.revokedAt) return null;
  await db().agentCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } });
  return { id: credential.id };
}

function sameHash(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type LeasedJob = { jobId: string; leaseToken: string; expiresAt: string; evidenceHash: string; promptVersion: string; input: AiInput };

/**
 * Hands the next pending analysis to an agent. Leases expire; an expired
 * lease returns the job to the pool. Cached analyses for identical evidence
 * are completed here without involving the agent.
 */
export async function leaseNextJob(agentId: string): Promise<LeasedJob | null> {
  const now = new Date();
  // Return jobs of agents that went quiet to the pool.
  const expired = await db().aIJobLease.findMany({ where: { status: 'leased', expiresAt: { lt: now } }, select: { id: true, campaignBusinessId: true } });
  if (expired.length > 0) {
    await db().$transaction([
      db().aIJobLease.updateMany({ where: { id: { in: expired.map((l) => l.id) } }, data: { status: 'expired' } }),
      db().campaignBusiness.updateMany({ where: { id: { in: expired.map((l) => l.campaignBusinessId) }, aiStatus: 'running' }, data: { aiStatus: 'pending' } }),
    ]);
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = await db().campaignBusiness.findFirst({ where: { aiStatus: 'pending' }, orderBy: { updatedAt: 'asc' }, select: { id: true } });
    if (!candidate) return null;
    // Conditional claim: if another agent took it first, move on.
    const claimed = await db().campaignBusiness.updateMany({ where: { id: candidate.id, aiStatus: 'pending' }, data: { aiStatus: 'running' } });
    if (claimed.count === 0) continue;

    const input = await buildAnalysisInput(db(), candidate.id);
    if (!input) {
      await db().campaignBusiness.update({ where: { id: candidate.id }, data: { aiStatus: 'skipped' } });
      continue;
    }
    const hash = evidenceHash(input);
    const cached = await db().aIAnalysis.findUnique({
      where: { campaignBusinessId_evidenceHash_promptVersion: { campaignBusinessId: candidate.id, evidenceHash: hash, promptVersion: PROMPT_VERSION } },
    });
    if (cached?.status === 'completed') {
      await db().campaignBusiness.update({ where: { id: candidate.id }, data: { aiStatus: 'completed' } });
      continue;
    }

    const leaseToken = randomBytes(24).toString('base64url');
    const expiresAt = new Date(now.getTime() + LEASE_MS);
    const lease = await db().aIJobLease.create({
      data: { agentId, campaignBusinessId: candidate.id, evidenceHash: hash, promptVersion: PROMPT_VERSION, leaseTokenHash: hmac(leaseToken), expiresAt },
    });
    return { jobId: lease.id, leaseToken, expiresAt: expiresAt.toISOString(), evidenceHash: hash, promptVersion: PROMPT_VERSION, input };
  }
  return null;
}

type LeaseCheck = { ok: true; lease: NonNullable<Awaited<ReturnType<typeof findLease>>> } | { ok: false; status: number; error: string };

async function findLease(jobId: string) {
  return db().aIJobLease.findUnique({ where: { id: jobId } });
}

async function checkLease(jobId: string, agentId: string, leaseToken: string): Promise<LeaseCheck> {
  const lease = await findLease(jobId);
  if (!lease || lease.agentId !== agentId || !sameHash(lease.leaseTokenHash, hmac(leaseToken))) {
    return { ok: false, status: 404, error: 'lease_not_found' };
  }
  if (lease.status !== 'leased' || lease.expiresAt.getTime() < Date.now()) return { ok: false, status: 410, error: 'lease_expired' };
  return { ok: true, lease };
}

export async function heartbeat(jobId: string, agentId: string, leaseToken: string) {
  const check = await checkLease(jobId, agentId, leaseToken);
  if (!check.ok) return check;
  const expiresAt = new Date(Date.now() + LEASE_MS);
  await db().aIJobLease.update({ where: { id: jobId }, data: { expiresAt } });
  return { ok: true as const, expiresAt: expiresAt.toISOString() };
}

/**
 * Accepts a result only for a live lease whose evidence is still current; a
 * result for older evidence is rejected so it can never overwrite newer data.
 * The output is re-validated here — the agent is not trusted to have done it.
 */
export async function submitResult(
  jobId: string,
  agentId: string,
  body: { leaseToken: string; evidenceHash: string; model: string; output?: string; error?: string },
) {
  const check = await checkLease(jobId, agentId, body.leaseToken);
  if (!check.ok) return check;
  const { lease } = check;
  if (!sameHash(lease.evidenceHash, body.evidenceHash)) return { ok: false as const, status: 409, error: 'evidence_mismatch' };

  const input = await buildAnalysisInput(db(), lease.campaignBusinessId);
  const currentHash = input ? evidenceHash(input) : null;
  const key = {
    campaignBusinessId_evidenceHash_promptVersion: { campaignBusinessId: lease.campaignBusinessId, evidenceHash: lease.evidenceHash, promptVersion: lease.promptVersion },
  };

  if (!input || currentHash !== lease.evidenceHash) {
    await db().$transaction([
      db().aIJobLease.update({ where: { id: lease.id }, data: { status: 'rejected' } }),
      db().campaignBusiness.update({ where: { id: lease.campaignBusinessId }, data: { aiStatus: 'pending' } }),
    ]);
    return { ok: false as const, status: 409, error: 'stale_evidence' };
  }

  const model = body.model.slice(0, 100);
  const validation = body.output ? validateAnalysis(body.output, new Set(input.evidence.map((e) => e.id))) : null;
  const succeeded = Boolean(validation?.value);
  const error = succeeded ? null : (body.error?.slice(0, 500) ?? `Geçersiz çıktı: ${validation?.problems.join('; ') ?? 'boş yanıt'}`);

  await db().$transaction(async (tx) => {
    await tx.aIAnalysis.upsert({
      where: key,
      create: { ...key.campaignBusinessId_evidenceHash_promptVersion, model, status: succeeded ? 'completed' : 'failed', output: validation?.value ?? undefined, error },
      update: { model, status: succeeded ? 'completed' : 'failed', output: validation?.value ?? undefined, error },
    });
    await tx.aIJobLease.update({ where: { id: lease.id }, data: { status: succeeded ? 'completed' : 'rejected' } });
    await tx.campaignBusiness.update({ where: { id: lease.campaignBusinessId }, data: { aiStatus: succeeded ? 'completed' : 'failed' } });
    await enqueueSheetChange(tx, lease.campaignBusinessId);
  });
  return succeeded ? { ok: true as const } : { ok: false as const, status: 422, error: 'invalid_output' };
}
