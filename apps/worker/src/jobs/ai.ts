import { serviceTemplateLabel, type RuleResult } from '@prospectnest/core';
import { enqueueSheetChange, getDb, type PrismaClient } from '@prospectnest/db';
import {
  analyze,
  AnalysisError,
  evidenceHash,
  OllamaError,
  PROMPT_VERSION,
  type AnalysisInput,
  type OllamaClient,
} from '@prospectnest/integrations';
import { logger } from '../logger';

export type AiJob = { campaignBusinessId: string };

async function buildInput(db: PrismaClient, campaignBusinessId: string): Promise<AnalysisInput | null> {
  const lead = await db.campaignBusiness.findUnique({
    where: { id: campaignBusinessId },
    include: {
      campaign: { select: { serviceDescription: true, template: true } },
      business: { select: { name: true, evidence: { orderBy: { signal: 'asc' } } } },
      evaluations: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  const evaluation = lead?.evaluations[0];
  if (!lead || !evaluation) return null;
  return {
    serviceDescription: lead.campaign.serviceDescription,
    serviceLabel: serviceTemplateLabel[lead.campaign.template],
    businessName: lead.business.name,
    evidence: lead.business.evidence.map((e) => ({ id: e.id, signal: e.signal, status: e.observationStatus, excerpt: e.excerpt, sourceUrl: e.sourceUrl })),
    rule: {
      score: evaluation.score,
      priority: evaluation.priority,
      coverage: evaluation.evidenceCoverage,
      results: (evaluation.results as RuleResult[]).map((r) => ({ signal: r.signal, status: r.status, impact: r.impact })),
    },
  };
}

async function setStatus(db: PrismaClient, campaignBusinessId: string, aiStatus: 'pending' | 'running' | 'completed' | 'failed' | 'skipped') {
  await db.$transaction(async (tx) => {
    await tx.campaignBusiness.update({ where: { id: campaignBusinessId }, data: { aiStatus } });
    await enqueueSheetChange(tx, campaignBusinessId);
  });
}

/**
 * Produces a local AI comment for one lead. The rule score is never touched.
 * Results are cached by evidence hash + prompt version, so unchanged evidence
 * never costs a second model call, and a result computed for old evidence is
 * stored under its own hash and cannot overwrite the analysis of newer data.
 */
export async function processAnalysis(campaignBusinessId: string, client: OllamaClient, db: PrismaClient = getDb()): Promise<void> {
  const input = await buildInput(db, campaignBusinessId);
  if (!input) {
    await setStatus(db, campaignBusinessId, 'skipped');
    return;
  }
  const hash = evidenceHash(input);
  const key = { campaignBusinessId_evidenceHash_promptVersion: { campaignBusinessId, evidenceHash: hash, promptVersion: PROMPT_VERSION } };

  const cached = await db.aIAnalysis.findUnique({ where: key });
  if (cached?.status === 'completed') {
    await setStatus(db, campaignBusinessId, 'completed');
    return;
  }

  await db.aIAnalysis.upsert({
    where: key,
    create: { campaignBusinessId, evidenceHash: hash, promptVersion: PROMPT_VERSION, model: client.model, status: 'running' },
    update: { status: 'running', error: null, model: client.model },
  });
  await setStatus(db, campaignBusinessId, 'running');

  try {
    const output = await analyze(client, input);
    await db.aIAnalysis.update({ where: key, data: { status: 'completed', output, error: null } });
    // Only report completion if the evidence is still the one we analysed.
    const current = await buildInput(db, campaignBusinessId);
    await setStatus(db, campaignBusinessId, current && evidenceHash(current) === hash ? 'completed' : 'pending');
  } catch (error) {
    const message =
      error instanceof OllamaError || error instanceof AnalysisError ? error.message : 'Yerel analiz tamamlanamadı.';
    if (!(error instanceof OllamaError || error instanceof AnalysisError)) logger.error('yerel analiz hatası', { campaignBusinessId, error: String(error) });
    await db.aIAnalysis.update({ where: key, data: { status: 'failed', error: message } });
    await setStatus(db, campaignBusinessId, 'failed');
  }
}
