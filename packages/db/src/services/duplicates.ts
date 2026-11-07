import type { PrismaClient } from '../generated/prisma/client';
import { evaluateCampaignBusiness } from './scoring';

export class MergeError extends Error {}

/**
 * Folds a possible duplicate into the record it was flagged against. Sources,
 * contacts, evidence and campaign memberships move over; the surviving record
 * keeps its own values and only gains fields it did not have. All in one
 * transaction, then affected leads are re-scored.
 */
export async function mergeDuplicate(db: PrismaClient, duplicateId: string): Promise<{ keptId: string }> {
  const affectedLeads = await db.$transaction(async (tx) => {
    const duplicate = await tx.business.findUnique({ where: { id: duplicateId } });
    if (!duplicate?.duplicateOfId) throw new MergeError('Bu kayıt olası eşleşme olarak işaretli değil.');
    const kept = await tx.business.findUnique({ where: { id: duplicate.duplicateOfId } });
    if (!kept) throw new MergeError('Asıl kayıt bulunamadı.');

    await tx.business.update({
      where: { id: kept.id },
      data: {
        website: kept.website ?? duplicate.website,
        domain: kept.domain ?? duplicate.domain,
        country: kept.country ?? duplicate.country,
        city: kept.city ?? duplicate.city,
        district: kept.district ?? duplicate.district,
        address: kept.address ?? duplicate.address,
        category: kept.category ?? duplicate.category,
        lastCheckedAt: kept.lastCheckedAt ?? duplicate.lastCheckedAt,
      },
    });

    await tx.businessSource.updateMany({ where: { businessId: duplicate.id }, data: { businessId: kept.id } });
    await tx.evidence.updateMany({ where: { businessId: duplicate.id }, data: { businessId: kept.id } });

    const contacts = await tx.contact.findMany({ where: { businessId: duplicate.id } });
    if (contacts.length > 0) {
      await tx.contact.createMany({
        data: contacts.map(({ kind, value, sourceUrl, seenAt }) => ({ businessId: kept.id, kind, value, sourceUrl, seenAt })),
        skipDuplicates: true,
      });
    }

    const keptLinks = new Set((await tx.campaignBusiness.findMany({ where: { businessId: kept.id }, select: { campaignId: true } })).map((l) => l.campaignId));
    const duplicateLinks = await tx.campaignBusiness.findMany({ where: { businessId: duplicate.id }, select: { id: true, campaignId: true } });
    for (const link of duplicateLinks) {
      // Already in that campaign through the kept record: the duplicate's lead goes away.
      if (keptLinks.has(link.campaignId)) await tx.campaignBusiness.delete({ where: { id: link.id } });
      else await tx.campaignBusiness.update({ where: { id: link.id }, data: { businessId: kept.id } });
    }

    // Other records pointing at the duplicate now point at the survivor.
    await tx.business.updateMany({ where: { duplicateOfId: duplicate.id }, data: { duplicateOfId: kept.id } });
    await tx.business.delete({ where: { id: duplicate.id } });

    return { keptId: kept.id, leads: await tx.campaignBusiness.findMany({ where: { businessId: kept.id }, select: { id: true } }) };
  });

  for (const lead of affectedLeads.leads) await evaluateCampaignBusiness(db, lead.id);
  return { keptId: affectedLeads.keptId };
}

/** The user decided these are different businesses: clear the flag. */
export async function keepSeparate(db: PrismaClient, duplicateId: string): Promise<void> {
  await db.business.update({ where: { id: duplicateId }, data: { duplicateOfId: null } });
}
