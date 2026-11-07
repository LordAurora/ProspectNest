import { z } from 'zod';
import { LEAD_STATUSES, PRIORITIES, toCsv } from '@prospectnest/core';
import { loadExportableLeads } from '@prospectnest/db';
import { buildLeadsWorkbook, MACHINE_COLUMNS, tabTitleFor, toMachineRow } from '@prospectnest/integrations';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  format: z.enum(['csv', 'xlsx']).default('csv'),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
});

/**
 * Export of a campaign as CSV or Excel. Same columns and source policy as the
 * Sheets export; cells that look like formulas are escaped (CSV) or stored as
 * plain strings (xlsx). Optional priority/status filters mirror the list view.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!z.uuid().safeParse(id).success || !query.success) return Response.json({ error: 'bad_request' }, { status: 400 });

  const campaign = await db().campaign.findUnique({ where: { id }, select: { name: true } });
  if (!campaign) return Response.json({ error: 'not_found' }, { status: 404 });

  const { format, priority, status } = query.data;
  const filtered = priority || status;
  const leadIds = filtered
    ? (await db().campaignBusiness.findMany({ where: { campaignId: id, priority, status }, select: { id: true } })).map((l) => l.id)
    : undefined;
  const { leads, blocked } = await loadExportableLeads(db(), id, leadIds);
  const baseName = tabTitleFor(campaign.name).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'kampanya';
  const headers = {
    'cache-control': 'no-store',
    'x-excluded-rows': String(blocked.length),
  };

  if (format === 'xlsx') {
    const buffer = await buildLeadsWorkbook(leads, { campaignName: campaign.name, generatedAt: new Date(), excluded: blocked });
    return new Response(new Uint8Array(buffer), {
      headers: {
        ...headers,
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(`${baseName}.xlsx`)}`,
      },
    });
  }

  const csv = toCsv([[...MACHINE_COLUMNS], ...leads.map((lead) => toMachineRow(lead).values)]);
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      ...headers,
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(`${baseName}.csv`)}`,
    },
  });
}
