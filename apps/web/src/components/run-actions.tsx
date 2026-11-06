'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Play, RotateCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cancelRun, retryRun, startResearch, type RunActionState } from '@/app/(app)/runs/actions';

function ActionError({ state }: { state: RunActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="flex items-center gap-1.5 text-[13px] text-danger">
      <CircleAlert className="size-4 shrink-0" aria-hidden />
      {state.error}
    </p>
  );
}

export function StartResearchButton({ campaignId, disabled }: { campaignId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(startResearch.bind(null, campaignId), {});
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <Button type="submit" variant="primary" loading={pending} disabled={disabled}>
        <Play aria-hidden />
        Araştırmayı başlat
      </Button>
      <ActionError state={state} />
    </form>
  );
}

export function CancelRunButton({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState(cancelRun.bind(null, runId), {});
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <Button type="submit" variant="danger" loading={pending}>
        <Square aria-hidden />
        İptal et
      </Button>
      <ActionError state={state} />
    </form>
  );
}

export function RetryRunButton({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState(retryRun.bind(null, runId), {});
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <Button type="submit" loading={pending}>
        <RotateCw aria-hidden />
        Yeniden dene
      </Button>
      <ActionError state={state} />
    </form>
  );
}

/** Refreshes server data while a run is active; stops as soon as it finishes. */
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, router]);
  return null;
}
