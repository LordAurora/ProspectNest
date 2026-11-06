import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { db } from '@/lib/db';

/** Everything the lead detail view needs, in one round of queries. */
export const loadLead = cache(async (id: string) => {
  if (!z.uuid().safeParse(id).success) return null;
  const lead = await db().campaignBusiness.findUnique({
    where: { id },
    include: {
      campaign: { select: { id: true, name: true, template: true, ruleVersion: true, isDemo: true } },
      business: {
        include: {
          contacts: { orderBy: [{ kind: 'asc' }, { seenAt: 'desc' }] },
          evidence: { orderBy: [{ observationStatus: 'asc' }, { signal: 'asc' }] },
          sources: { orderBy: { firstSeenAt: 'asc' } },
          duplicateOf: { select: { id: true, name: true, city: true } },
        },
      },
      evaluations: { orderBy: { createdAt: 'desc' }, take: 10 },
      analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!lead) return null;

  const runItems = await db().runItem.findMany({
    where: { businessId: lead.businessId, run: { campaignId: lead.campaignId } },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: { id: true, status: true, error: true, updatedAt: true, runId: true },
  });
  return { ...lead, runItems };
});

export type LeadDetailData = NonNullable<Awaited<ReturnType<typeof loadLead>>>;

/** Only http(s) URLs from stored data are ever rendered as links. */
export function safeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
