import { serviceTemplateLabel, type RuleResult } from '@prospectnest/core';
import type { Prisma, PrismaClient } from '../generated/prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

/** Structurally identical to AnalysisInput in packages/integrations. */
export type AiInput = {
  serviceDescription: string;
  serviceLabel: string;
  businessName: string;
  evidence: { id: string; signal: string; status: string; excerpt: string | null; sourceUrl: string }[];
  rule: { score: number; priority: string; coverage: number; results: { signal: string; status: string; impact: number }[] };
};

/** Everything the model may see about a lead: service, evidence excerpts and the rule result. Nothing else. */
export async function buildAnalysisInput(db: Client, campaignBusinessId: string): Promise<AiInput | null> {
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
