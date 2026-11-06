import { buildAnalysisInput, enqueueSheetChange, getDb, type PrismaClient } from '@prospectnest/db';
import {
  analyze,
  AnalysisError,
  evidenceHash,
  OllamaError,
  PROMPT_VERSION,
  type OllamaClient,
} from '@prospectnest/integrations';
import { logger } from '../logger';

export type AiJob = { campaignBusinessId: string };

export async function setAiStatus(db: PrismaClient, campaignBusinessId: string, aiStatus: 'pending' | 'running' | 'completed' | 'failed' | 'skipped') {
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
  const input = await buildAnalysisInput(db, campaignBusinessId);
  if (!input) {
    await setAiStatus(db, campaignBusinessId, 'skipped');
    return;
  }
  const hash = evidenceHash(input);
  const key = { campaignBusinessId_evidenceHash_promptVersion: { campaignBusinessId, evidenceHash: hash, promptVersion: PROMPT_VERSION } };

  const cached = await db.aIAnalysis.findUnique({ where: key });
  if (cached?.status === 'completed') {
    await setAiStatus(db, campaignBusinessId, 'completed');
    return;
  }

  await db.aIAnalysis.upsert({
    where: key,
    create: { campaignBusinessId, evidenceHash: hash, promptVersion: PROMPT_VERSION, model: client.model, status: 'running' },
    update: { status: 'running', error: null, model: client.model },
  });
  await setAiStatus(db, campaignBusinessId, 'running');

  try {
    const output = await analyze(client, input);
    await db.aIAnalysis.update({ where: key, data: { status: 'completed', output, error: null } });
    // Only report completion if the evidence is still the one we analysed.
    const current = await buildAnalysisInput(db, campaignBusinessId);
    await setAiStatus(db, campaignBusinessId, current && evidenceHash(current) === hash ? 'completed' : 'pending');
  } catch (error) {
    const message =
      error instanceof OllamaError || error instanceof AnalysisError ? error.message : 'Yerel analiz tamamlanamadı.';
    if (!(error instanceof OllamaError || error instanceof AnalysisError)) logger.error('yerel analiz hatası', { campaignBusinessId, error: String(error) });
    await db.aIAnalysis.update({ where: key, data: { status: 'failed', error: message } });
    await setAiStatus(db, campaignBusinessId, 'failed');
  }
}
