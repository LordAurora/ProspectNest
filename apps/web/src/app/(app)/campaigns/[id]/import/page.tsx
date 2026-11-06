import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/ui/panel';
import { CsvImport } from './csv-import';

export const metadata: Metadata = { title: 'CSV içe aktar' };
export const dynamic = 'force-dynamic';

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = z.uuid().safeParse(id).success
    ? await db().campaign.findUnique({ where: { id }, select: { id: true, name: true, archivedAt: true } })
    : null;
  if (!campaign || campaign.archivedAt) notFound();

  return (
    <>
      <div className="mb-2 text-[13px] text-fg-muted">
        <Link href="/campaigns" className="hover:text-fg">
          Kampanyalar
        </Link>
        <span className="px-1.5 text-fg-subtle">/</span>
        <Link href={`/campaigns/${campaign.id}`} className="hover:text-fg">
          {campaign.name}
        </Link>
      </div>
      <PageHeader title="CSV içe aktar" description="Kolonları eşleyin, hatalı satırları görün, sonra içe aktarın." />
      <div className="max-w-5xl">
        <CsvImport campaignId={campaign.id} />
      </div>
    </>
  );
}
