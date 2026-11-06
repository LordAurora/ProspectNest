'use client';

import { useActionState, useState, useTransition } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { createAgentTokenAction, revokeAgentToken, type AgentTokenState } from './actions';

export type AgentRow = { id: string; name: string; prefix: string; lastUsed: string | null; revoked: boolean };

export function AgentTokens({ agents, agentMode }: { agents: AgentRow[]; agentMode: boolean }) {
  const [state, action, pending] = useActionState<AgentTokenState, FormData>(createAgentTokenAction, {});
  const [copied, setCopied] = useState(false);
  const [revoking, startRevoke] = useTransition();

  return (
    <div className="flex flex-col gap-4 px-4 py-4 text-[13px]">
      {!agentMode ? (
        <p className="text-fg-muted">
          Hibrit mod kapalı. Sunucuda <code className="font-mono">AI_MODE=agent</code> ayarlandığında agent'lar AI işlerini alabilir.
        </p>
      ) : null}

      {agents.length > 0 ? (
        <ul className="divide-y divide-border rounded-control border border-border">
          {agents.map((agent) => (
            <li key={agent.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
              <KeyRound className="size-4 text-fg-subtle" aria-hidden />
              <span className="font-medium text-fg">{agent.name}</span>
              <code className="font-mono text-[12px] text-fg-muted">{agent.prefix}…</code>
              <span className="text-[12px] text-fg-subtle">{agent.revoked ? 'İptal edildi' : agent.lastUsed ? `Son kullanım ${agent.lastUsed}` : 'Henüz kullanılmadı'}</span>
              {!agent.revoked ? (
                <Button
                  size="sm"
                  variant="danger"
                  className="ml-auto"
                  loading={revoking}
                  onClick={() => startRevoke(() => revokeAgentToken(agent.id))}
                >
                  İptal et
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {state.token ? (
        <div role="status" className="flex flex-col gap-2 rounded-control border border-accent bg-accent-soft px-3 py-3">
          <p className="font-medium text-fg">Token oluşturuldu. Bir daha gösterilmeyecek; şimdi kopyalayın.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[5px] bg-surface px-2 py-1.5 font-mono text-[12px]">{state.token}</code>
            <Button
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(state.token ?? '');
                setCopied(true);
              }}
            >
              <Copy aria-hidden />
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </Button>
          </div>
          <p className="text-[12px] text-fg-muted">Bilgisayarınızdaki agent yapılandırmasında AGENT_TOKEN olarak kullanın.</p>
        </div>
      ) : null}

      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Field label="Yeni agent adı" htmlFor="agent-name" error={state.error}>
            <Input id="agent-name" name="name" placeholder="ör. Ev bilgisayarı" maxLength={60} />
          </Field>
        </div>
        <Button type="submit" loading={pending}>
          Token oluştur
        </Button>
      </form>
    </div>
  );
}
