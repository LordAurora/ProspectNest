import type { Metadata } from 'next';
import { discoveryStatus } from '@/lib/system';
import { PageHeader } from '@/components/ui/panel';
import { CampaignWizard } from './campaign-wizard';

export const metadata: Metadata = { title: 'Yeni kampanya' };

export default function NewCampaignPage() {
  const discovery = discoveryStatus();
  return (
    <>
      <PageHeader title="Yeni kampanya" description="Ne sattığınızı, kimi hedeflediğinizi ve işletmelerin nereden geleceğini tanımlayın." />
      <CampaignWizard
        discovery={
          discovery.status === 'ready' ? { ready: true, reason: '' } : { ready: false, reason: discovery.reason }
        }
      />
    </>
  );
}
