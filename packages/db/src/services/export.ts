import { createHash } from 'node:crypto';
import { priorityLabel } from '@prospectnest/core';
import type { Prisma, PrismaClient } from '../generated/prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

/** Mirrors the shape the Sheets/CSV writers expect (packages/integrations LeadExport). */
export type ExportLead = {
  leadId: string;
  name: string;
  country: string | null;
  city: string | null;
  category: string | null;
  website: string | null;
  emails: string[];
  phones: string[];
  score: number | null;
  assessment: string;
  evidenceLinks: string[];
  source: string;
  firstSeen: Date;
  lastChecked: Date | null;
  aiStatus: string;
};

export type ExportBlock = { leadId: string; name: string; reason: string };

const aiStatusLabel: Record<string, string> = {
  pending: 'bekliyor',
  running: 'çalışıyor',
  completed: 'tamamlandı',
  failed: 'başarısız',
  skipped: 'kapalı',
};

const leadInclude = {
  business: {
    include: {
      contacts: true,
      evidence: { where: { observationStatus: 'present' as const }, orderBy: { fetchedAt: 'desc' as const } },
      sources: true,
    },
  },
} satisfies Prisma.CampaignBusinessInclude;

export type LeadWithBusiness = Prisma.CampaignBusinessGetPayload<{ include: typeof leadInclude }>;

/**
 * Applies source policy before anything leaves the system: synthetic demo
 * rows and businesses from a source that forbids export are withheld
 * entirely; evidence marked restricted is dropped from the links.
 */
export function toExport(lead: LeadWithBusiness): { lead?: ExportLead; block?: ExportBlock } {
  const { business } = lead;
  if (business.isDemo) return { block: { leadId: lead.id, name: business.name, reason: 'Sentetik demo verisi dışa aktarılamaz.' } };
  const forbidden = business.sources.find((s) => s.exportPolicy === 'forbidden');
  if (forbidden) {
    return { block: { leadId: lead.id, name: business.name, reason: `"${forbidden.provider}" kaynağının koşulları dışa aktarıma izin vermiyor.` } };
  }
  const evidenceLinks = [
    ...new Set(business.evidence.filter((e) => e.exportPolicy === 'allowed' && /^https?:\/\//.test(e.sourceUrl)).map((e) => e.sourceUrl)),
  ];
  return {
    lead: {
      leadId: lead.id,
      name: business.name,
      country: business.country,
      city: business.city,
      category: business.category,
      website: business.website,
      emails: business.contacts.filter((c) => c.kind === 'email').map((c) => c.value),
      phones: business.contacts.filter((c) => c.kind === 'phone').map((c) => c.value),
      score: lead.opportunityScore,
      assessment: priorityLabel[lead.priority],
      evidenceLinks,
      source: [...new Set(business.sources.map((s) => s.provider))].join(', '),
      firstSeen: lead.firstSeenAt,
      lastChecked: business.lastCheckedAt,
      aiStatus: aiStatusLabel[lead.aiStatus] ?? lead.aiStatus,
    },
  };
}

export async function loadExportableLeads(
  db: Client,
  campaignId: string,
  leadIds?: string[],
): Promise<{ leads: ExportLead[]; blocked: ExportBlock[] }> {
  const rows = await db.campaignBusiness.findMany({
    where: { campaignId, ...(leadIds ? { id: { in: leadIds } } : {}) },
    include: leadInclude,
    orderBy: { firstSeenAt: 'asc' },
  });
  const leads: ExportLead[] = [];
  const blocked: ExportBlock[] = [];
  for (const row of rows) {
    const result = toExport(row);
    if (result.lead) leads.push(result.lead);
    if (result.block) blocked.push(result.block);
  }
  return { leads, blocked };
}

export function exportChecksum(lead: ExportLead): string {
  return createHash('sha256').update(JSON.stringify(lead)).digest('hex').slice(0, 32);
}

/**
 * Records that a lead changed and must be re-sent to Sheets. Call it inside
 * the same transaction as the change; duplicates of the latest checksum are skipped.
 */
export async function enqueueSheetChange(tx: Client, campaignBusinessId: string): Promise<void> {
  const lead = await tx.campaignBusiness.findUnique({
    where: { id: campaignBusinessId },
    include: { ...leadInclude, campaign: { select: { sheetSync: { select: { id: true } } } } },
  });
  if (!lead?.campaign.sheetSync) return;
  const exported = toExport(lead).lead;
  if (!exported) return;

  const checksum = exportChecksum(exported);
  const latest = await tx.syncOutbox.findFirst({ where: { campaignBusinessId }, orderBy: { revision: 'desc' } });
  if (latest?.checksum === checksum) return;
  await tx.syncOutbox.create({ data: { campaignBusinessId, revision: (latest?.revision ?? 0) + 1, checksum } });
}
