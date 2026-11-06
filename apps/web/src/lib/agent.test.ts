import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Requires a disposable, migrated PostgreSQL: TEST_DATABASE_URL=... pnpm --filter @prospectnest/web test */
const databaseUrl = process.env.TEST_DATABASE_URL;

const validOutput = (evidenceId: string) =>
  JSON.stringify({ summary: 'PDF menü var.', assessment: 'potential_fit', evidenceIds: [evidenceId], uncertainties: [], suggestedNextStep: 'Arayın.' });

describe.skipIf(!databaseUrl)('agent leases (PostgreSQL)', () => {
  let agent: typeof import('./agent');
  let db: Awaited<ReturnType<typeof import('@prospectnest/db')['getDb']>>;
  let campaignId: string;
  let leadId: string;
  let businessId: string;
  let evidenceId: string;

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: databaseUrl, SESSION_SECRET: 'x'.repeat(40), AI_MODE: 'agent' });
    db = (await import('@prospectnest/db')).getDb();
    agent = await import('./agent');
    const { evaluateCampaignBusiness } = await import('@prospectnest/db');

    const campaign = await db.campaign.create({
      data: { name: `agent-${randomUUID()}`, serviceDescription: 'QR menü', template: 'qr_menu', countries: ['TR'], cities: [], categories: ['Kafe'] },
    });
    campaignId = campaign.id;
    const business = await db.business.create({ data: { name: 'Lavanta', normalizedName: 'lavanta', website: 'https://l.example' } });
    businessId = business.id;
    const evidence = await db.evidence.create({
      data: { businessId, signal: 'pdf_or_image_menu', observationStatus: 'present', sourceUrl: 'https://l.example/menu', fetchedAt: new Date(), excerpt: 'PDF menü' },
    });
    evidenceId = evidence.id;
    const lead = await db.campaignBusiness.create({ data: { campaignId, businessId, aiStatus: 'pending' } });
    leadId = lead.id;
    await evaluateCampaignBusiness(db, leadId);
  });

  afterAll(async () => {
    await db.agentCredential.deleteMany({ where: { leases: { some: { campaignBusinessId: leadId } } } });
    if (campaignId) await db.campaign.delete({ where: { id: campaignId } });
    if (businessId) await db.business.delete({ where: { id: businessId } });
    await db.$disconnect();
  });

  it('accepts a valid result for the current evidence and rejects reuse of the lease', async () => {
    const { id: agentId } = await agent.createAgentToken('test');
    const job = await agent.leaseNextJob(agentId);
    expect(job?.input.evidence.map((e) => e.id)).toEqual([evidenceId]);

    const accepted = await agent.submitResult(job!.jobId, agentId, { leaseToken: job!.leaseToken, evidenceHash: job!.evidenceHash, model: 'm', output: validOutput(evidenceId) });
    expect(accepted).toMatchObject({ ok: true });
    expect((await db.campaignBusiness.findUniqueOrThrow({ where: { id: leadId } })).aiStatus).toBe('completed');

    const replay = await agent.submitResult(job!.jobId, agentId, { leaseToken: job!.leaseToken, evidenceHash: job!.evidenceHash, model: 'm', output: validOutput(evidenceId) });
    expect(replay).toMatchObject({ ok: false, status: 410 });
  });

  it('rejects a result computed for evidence that has since changed', async () => {
    // Identical evidence would be served from the cache, so start from changed evidence.
    await db.evidence.update({ where: { id: evidenceId }, data: { excerpt: 'Menü PDF olarak güncellendi' } });
    await db.campaignBusiness.update({ where: { id: leadId }, data: { aiStatus: 'pending' } });
    const { id: agentId } = await agent.createAgentToken('stale');
    const job = await agent.leaseNextJob(agentId);
    expect(job).not.toBeNull();
    // New research replaced the excerpt again while the agent was working.
    await db.evidence.update({ where: { id: evidenceId }, data: { excerpt: 'Menü artık dijital' } });

    const stale = await agent.submitResult(job!.jobId, agentId, { leaseToken: job!.leaseToken, evidenceHash: job!.evidenceHash, model: 'm', output: validOutput(evidenceId) });
    expect(stale).toMatchObject({ ok: false, status: 409, error: 'stale_evidence' });
    expect((await db.campaignBusiness.findUniqueOrThrow({ where: { id: leadId } })).aiStatus).toBe('pending');
  });

  it('rejects wrong lease tokens, other agents and expired leases', async () => {
    const { id: agentId } = await agent.createAgentToken('a');
    const { id: otherId } = await agent.createAgentToken('b');
    const job = await agent.leaseNextJob(agentId);
    expect(await agent.heartbeat(job!.jobId, agentId, 'wrong')).toMatchObject({ ok: false, status: 404 });
    expect(await agent.heartbeat(job!.jobId, otherId, job!.leaseToken)).toMatchObject({ ok: false, status: 404 });

    await db.aIJobLease.update({ where: { id: job!.jobId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await agent.heartbeat(job!.jobId, agentId, job!.leaseToken)).toMatchObject({ ok: false, status: 410 });
    // The expired job returns to the pool for the next agent.
    const next = await agent.leaseNextJob(otherId);
    expect(next?.jobId).not.toBe(job!.jobId);
  });

  it('refuses revoked tokens', async () => {
    const { token, id } = await agent.createAgentToken('revoked');
    const request = () => new Request('http://x/api/agent/jobs/lease', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    expect(await agent.authenticateAgent(request())).toEqual({ id });
    await db.agentCredential.update({ where: { id }, data: { revokedAt: new Date() } });
    expect(await agent.authenticateAgent(request())).toBeNull();
  });
});
