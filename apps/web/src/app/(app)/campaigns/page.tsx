import type { Metadata } from 'next';
import Link from 'next/link';
import { Target } from 'lucide-react';
import { serviceTemplateLabel } from '@prospectnest/core';
import { db } from '@/lib/db';
import { formatDateTime, formatNumber } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader, Panel } from '@/components/ui/panel';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Kampanyalar' };
export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const campaigns = await db().campaign.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      template: true,
      cities: true,
      categories: true,
      dailyNewLimit: true,
      recheckIntervalDays: true,
      isDemo: true,
      createdAt: true,
      _count: { select: { businesses: true } },
    },
  });

  return (
    <>
      <PageHeader title="Kampanyalar" description="Hizmet şablonu, hedef bölge ve araştırma sınırları kampanya bazında tanımlanır." />
      <Panel>
        {campaigns.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Henüz kampanya yok"
            description="Kampanya oluşturma sihirbazı bir sonraki sürümde eklenecek. Şimdilik demo verisi yüklenebilir."
          />
        ) : (
          <Table className="min-w-[760px]">
            <THead>
              <TH>Kampanya</TH>
              <TH>Hedef bölge</TH>
              <TH align="right">İşletme</TH>
              <TH align="right">Günlük limit</TH>
              <TH align="right">Yeniden kontrol</TH>
              <TH align="right">Oluşturulma</TH>
            </THead>
            <tbody>
              {campaigns.map((campaign) => (
                <TR key={campaign.id}>
                  <TD className="max-w-[340px]">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/businesses?campaign=${campaign.id}`}
                        className="truncate font-medium text-fg hover:text-accent"
                      >
                        {campaign.name}
                      </Link>
                      {campaign.isDemo ? <Badge tone="warning">Demo</Badge> : null}
                    </div>
                    <p className="text-[12px] text-fg-muted">{serviceTemplateLabel[campaign.template]}</p>
                  </TD>
                  <TD className="max-w-[260px] text-fg-muted">
                    <p className="truncate">{campaign.cities.join(', ') || '—'}</p>
                    <p className="truncate text-[12px] text-fg-subtle">{campaign.categories.join(', ')}</p>
                  </TD>
                  <TD align="right" numeric>
                    {formatNumber(campaign._count.businesses)}
                  </TD>
                  <TD align="right" numeric className="text-fg-muted">
                    {formatNumber(campaign.dailyNewLimit)}
                  </TD>
                  <TD align="right" numeric className="whitespace-nowrap text-fg-muted">
                    {campaign.recheckIntervalDays} gün
                  </TD>
                  <TD align="right" className="whitespace-nowrap text-fg-muted">
                    {formatDateTime(campaign.createdAt)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
