import type { Metadata } from 'next';
import { Bot, Cpu, FileSpreadsheet, Radar, type LucideIcon } from 'lucide-react';
import { formatRelative } from '@/lib/format';
import { getIntegrationSummaries, getWorkerState, type IntegrationSummary } from '@/lib/system';
import { Badge, type Tone } from '@/components/ui/badge';
import { PageHeader, Panel } from '@/components/ui/panel';

export const metadata: Metadata = { title: 'Entegrasyonlar' };
export const dynamic = 'force-dynamic';

const icons: Record<IntegrationSummary['key'], LucideIcon> = {
  sheets: FileSpreadsheet,
  discovery: Radar,
  ollama: Bot,
};

// "Not connected" is a normal setup state, so it is neutral rather than red.
const stateBadge: Record<IntegrationSummary['state'], { tone: Tone; label: string }> = {
  not_configured: { tone: 'neutral', label: 'Bağlı değil' },
  configured: { tone: 'accent', label: 'Yapılandırıldı' },
  disabled: { tone: 'neutral', label: 'Kapalı' },
};

function Row({ icon: Icon, name, badge, detail }: { icon: LucideIcon; name: string; badge: { tone: Tone; label: string }; detail: string }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-surface-muted text-fg-muted">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">{name}</p>
        <p className="text-[13px] text-fg-muted">{detail}</p>
      </div>
      <Badge tone={badge.tone} dot className="self-start sm:self-center">
        {badge.label}
      </Badge>
    </li>
  );
}

export default async function IntegrationsPage() {
  const worker = await getWorkerState();
  const integrations = getIntegrationSummaries();

  const workerBadge: { tone: Tone; label: string } =
    worker.status === 'online'
      ? { tone: 'success', label: 'Çalışıyor' }
      : worker.status === 'stale'
        ? { tone: 'danger', label: 'Yanıt vermiyor' }
        : { tone: 'warning', label: 'Başlatılmadı' };
  const workerDetail =
    worker.status === 'never'
      ? 'Arka plan işleri için worker sürecini başlatın (pnpm dev:worker veya Docker Compose).'
      : `${worker.hostname} · son sinyal ${formatRelative(worker.lastBeatAt)}`;

  return (
    <>
      <PageHeader
        title="Entegrasyonlar"
        description="Bağlantı durumları. Yapılandırılmış bir bağlantı, sağlık kontrolü geçene kadar çalışıyor sayılmaz."
      />
      <div className="flex max-w-3xl flex-col gap-6">
        <Panel>
          <ul className="divide-y divide-border">
            <Row icon={Cpu} name="Worker" badge={workerBadge} detail={workerDetail} />
          </ul>
        </Panel>
        <Panel>
          <ul className="divide-y divide-border">
            {integrations.map((integration) => (
              <Row
                key={integration.key}
                icon={icons[integration.key]}
                name={integration.name}
                badge={stateBadge[integration.state]}
                detail={integration.detail}
              />
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
