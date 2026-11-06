import type { Metadata } from 'next';
import { Bot, Cpu, FileSpreadsheet, Radar, type LucideIcon } from 'lucide-react';
import { readServiceAccountEmail } from '@prospectnest/integrations';
import { env } from '@/lib/env';
import { formatRelative } from '@/lib/format';
import { TestOllamaButton, TestSheetsButton } from '@/components/integration-actions';
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
  configured: { tone: 'neutral', label: 'Test edilmedi' },
  healthy: { tone: 'success', label: 'Bağlı' },
  error: { tone: 'danger', label: 'Hata' },
  disabled: { tone: 'neutral', label: 'Kapalı' },
};

function Row({
  icon: Icon,
  name,
  badge,
  detail,
  extra,
  action,
}: {
  icon: LucideIcon;
  name: string;
  badge: { tone: Tone; label: string };
  detail: string;
  extra?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-surface-muted text-fg-muted">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-fg">{name}</p>
          <Badge tone={badge.tone} dot>
            {badge.label}
          </Badge>
        </div>
        <p className="mt-0.5 text-[13px] text-fg-muted">{detail}</p>
        {extra}
      </div>
      {action}
    </li>
  );
}

export default async function IntegrationsPage() {
  const worker = await getWorkerState();
  const integrations = await getIntegrationSummaries();
  const keyFile = env().GOOGLE_APPLICATION_CREDENTIALS;
  const serviceAccount = keyFile ? await readServiceAccountEmail(keyFile) : null;

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
                extra={
                  integration.key === 'sheets' && integration.state !== 'not_configured' ? (
                    <details className="mt-2 text-[12px] text-fg-muted">
                      <summary className="cursor-pointer hover:text-fg">Kurulum ayrıntıları</summary>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        <li>
                          Tabloyu şu adresle düzenleyici olarak paylaşın:{' '}
                          <code className="font-mono text-fg">{serviceAccount ?? 'anahtar dosyası okunamadı'}</code>
                        </li>
                        <li>Her kampanya kendi sekmesine yazılır. A–O sütunları uygulamaya aittir; sağındaki takip sütunlarına hiç yazılmaz.</li>
                        <li>Aktarım sürerken sütun ekleme, silme veya başlık değiştirme yapmayın; satır sıralamak güvenlidir.</li>
                        {integration.lastSuccessAt ? <li>Son başarılı işlem: {formatRelative(integration.lastSuccessAt)}</li> : null}
                      </ul>
                    </details>
                  ) : null
                }
                action={
                  integration.key === 'sheets' && integration.state !== 'not_configured' ? (
                    <TestSheetsButton />
                  ) : integration.key === 'ollama' && integration.state !== 'disabled' && integration.state !== 'not_configured' ? (
                    <TestOllamaButton />
                  ) : null
                }
              />
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
