import type { Metadata } from 'next';
import { resolveDiscoveryProvider } from '@prospectnest/providers';
import { env } from '@/lib/env';
import { PageHeader } from '@/components/ui/panel';
import { CampaignWizard } from './campaign-wizard';

export const metadata: Metadata = { title: 'Yeni kampanya' };

export default function NewCampaignPage() {
  const discovery = resolveDiscoveryProvider(env().DISCOVERY_PROVIDER);
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
