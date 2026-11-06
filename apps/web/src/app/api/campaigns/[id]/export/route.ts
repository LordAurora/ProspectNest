import { z } from 'zod';
import { toCsv } from '@prospectnest/core';
import { loadExportableLeads } from '@prospectnest/db';
import { MACHINE_COLUMNS, tabTitleFor, toMachineRow } from '@prospectnest/integrations';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * CSV fallback when Sheets is not connected. Same columns and source policy
 * as the Sheets export; cells that look like formulas are escaped.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: 'not_found' }, { status: 404 });

  const campaign = await db().campaign.findUnique({ where: { id }, select: { name: true } });
  if (!campaign) return Response.json({ error: 'not_found' }, { status: 404 });

  const { leads, blocked } = await loadExportableLeads(db(), id);
  const csv = toCsv([[...MACHINE_COLUMNS], ...leads.map((lead) => toMachineRow(lead).values)]);
  const fileName = `${tabTitleFor(campaign.name).replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.csv`;

  return new Response(`﻿${csv}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
      'x-excluded-rows': String(blocked.length),
    },
  });
}
