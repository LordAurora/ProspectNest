import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadLead } from '@/lib/leads';
import { LeadDetail } from '@/components/lead/lead-detail';
import { Panel } from '@/components/ui/panel';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lead = await loadLead((await params).id);
  return { title: lead?.business.name ?? 'İşletme' };
}

export default async function LeadPage({ params }: Props) {
  const lead = await loadLead((await params).id);
  if (!lead) notFound();
  return (
    <>
      <div className="mb-4 text-[13px] text-fg-muted">
        <Link href={`/businesses?campaign=${lead.campaignId}`} className="hover:text-fg">
          İşletmeler
        </Link>
      </div>
      <Panel className="mx-auto max-w-3xl">
        <LeadDetail lead={lead} />
      </Panel>
    </>
  );
}
