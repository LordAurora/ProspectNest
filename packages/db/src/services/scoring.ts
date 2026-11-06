import { defaultRuleSet, evaluate, ruleSetSchema, type Evaluation } from '@prospectnest/core';
import type { Prisma, PrismaClient } from '../generated/prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

function fingerprint(ruleVersion: number, evaluation: Evaluation): string {
  return JSON.stringify([ruleVersion, evaluation.score, evaluation.priority, evaluation.contactability, evaluation.results]);
}

/**
 * Re-scores one campaign lead from its stored evidence. A new RuleEvaluation
 * row is written only when the outcome changed, so repeated calls (retries,
 * re-delivered jobs) leave the history untouched.
 */
export async function evaluateCampaignBusiness(db: Client, campaignBusinessId: string): Promise<Evaluation | null> {
  const lead = await db.campaignBusiness.findUnique({
    where: { id: campaignBusinessId },
    select: {
      id: true,
      campaign: { select: { template: true, rules: true, ruleVersion: true } },
      business: {
        select: {
          evidence: { select: { id: true, signal: true, observationStatus: true, excerpt: true, fetchedAt: true } },
          contacts: { select: { kind: true } },
        },
      },
      evaluations: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!lead) return null;

  const parsed = ruleSetSchema.safeParse(lead.campaign.rules);
  const ruleSet = parsed.success ? parsed.data : defaultRuleSet(lead.campaign.template);
  const { evidence, contacts } = lead.business;

  const evaluation = evaluate(
    ruleSet,
    evidence.map((e) => ({ id: e.id, signal: e.signal, status: e.observationStatus, excerpt: e.excerpt, fetchedAt: e.fetchedAt })),
    {
      email: contacts.filter((c) => c.kind === 'email').length,
      phone: contacts.filter((c) => c.kind === 'phone').length,
    },
  );

  const previous = lead.evaluations[0];
  const unchanged =
    previous &&
    previous.ruleVersion === lead.campaign.ruleVersion &&
    fingerprint(previous.ruleVersion, {
      score: previous.score,
      priority: previous.priority,
      contactability: previous.contactability,
      results: previous.results as Evaluation['results'],
      evidenceCoverage: previous.evidenceCoverage,
      evidenceIds: previous.evidenceIds,
    }) === fingerprint(lead.campaign.ruleVersion, evaluation);
  if (unchanged) return evaluation;

  const now = new Date();
  await db.ruleEvaluation.create({
    data: {
      campaignBusinessId: lead.id,
      ruleVersion: lead.campaign.ruleVersion,
      score: evaluation.score,
      evidenceCoverage: evaluation.evidenceCoverage,
      contactability: evaluation.contactability,
      priority: evaluation.priority,
      results: evaluation.results,
      evidenceIds: evaluation.evidenceIds,
    },
  });
  await db.campaignBusiness.update({
    where: { id: lead.id },
    data: {
      opportunityScore: evaluation.score,
      evidenceCoverage: evaluation.evidenceCoverage,
      contactability: evaluation.contactability,
      priority: evaluation.priority,
      lastEvaluatedAt: now,
    },
  });
  return evaluation;
}
