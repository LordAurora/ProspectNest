import type { Metadata } from 'next';
import { LogOut } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { formatDateTime, formatRelative } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel, PanelHeader } from '@/components/ui/panel';
import { logout } from '@/app/login/actions';
import { AgentTokens } from './agent-tokens';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Ayarlar' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const sessions = await db().session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, userAgent: true, ip: true, lastSeenAt: true },
  });
  const agents = await db().agentCredential.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });

  return (
    <>
      <PageHeader title="Ayarlar" description="Hesap, oturumlar ve yerel AI agent erişimi." />
      <div className="flex max-w-3xl flex-col gap-6">
        <Panel>
          <PanelHeader title="Hesap" />
          <dl className="grid gap-x-6 gap-y-3 px-4 py-4 text-[14px] sm:grid-cols-[160px_1fr]">
            <dt className="text-fg-muted">E-posta</dt>
            <dd className="text-fg">{user.email}</dd>
          </dl>
        </Panel>

        <Panel>
          <PanelHeader
            title="Parola"
            description="Değişiklik bu oturum dışındaki tüm oturumları kapatır. Parolayı unutursanız sunucuda pnpm admin:create ile sıfırlayabilirsiniz."
          />
          <PasswordForm />
        </Panel>

        <Panel>
          <PanelHeader
            title="Yerel AI agent'ları"
            description="Sunucu ile kendi bilgisayarınızdaki Ollama arasında köprü. Token yalnız AI işlerini alıp sonuç gönderebilir."
          />
          <AgentTokens
            agentMode={env().AI_MODE === 'agent'}
            agents={agents.map((a) => ({
              id: a.id,
              name: a.name,
              prefix: a.prefix,
              lastUsed: a.lastUsedAt ? formatRelative(a.lastUsedAt) : null,
              revoked: a.revokedAt !== null,
            }))}
          />
        </Panel>

        <Panel>
          <PanelHeader
            title="Açık oturumlar"
            action={
              <form action={logout}>
                <Button type="submit" size="sm" variant="secondary">
                  <LogOut aria-hidden />
                  Çıkış yap
                </Button>
              </form>
            }
          />
          <ul className="divide-y divide-border">
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px]">
                <span className="max-w-[460px] truncate text-fg">{session.userAgent ?? 'Bilinmeyen tarayıcı'}</span>
                <span className="text-fg-muted tabular-nums">
                  {session.ip ?? '—'} · {formatDateTime(session.lastSeenAt)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
