'use client';

import { useActionState } from 'react';
import { CircleAlert, CircleCheck, FileSpreadsheet, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { startSheetSync, testOllama, testSheetsConnection, type IntegrationActionState } from '@/app/(app)/integrations/actions';

function Feedback({ state }: { state: IntegrationActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="flex items-start gap-1.5 text-[12px] text-danger">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="flex items-start gap-1.5 text-[12px] text-fg-muted">
        <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
        {state.message}
      </p>
    );
  }
  return null;
}

export function TestSheetsButton() {
  const [state, action, pending] = useActionState(testSheetsConnection, {});
  return (
    <form action={action} className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button type="submit" size="sm" loading={pending}>
        <PlugZap aria-hidden />
        Bağlantıyı test et
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function SheetSyncButton({ campaignId }: { campaignId: string }) {
  const [state, action, pending] = useActionState(startSheetSync.bind(null, campaignId), {});
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <Button type="submit" size="sm" loading={pending}>
        <FileSpreadsheet aria-hidden />
        Sheets&apos;e aktar
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function TestOllamaButton() {
  const [state, action, pending] = useActionState(testOllama, {});
  return (
    <form action={action} className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button type="submit" size="sm" loading={pending}>
        <PlugZap aria-hidden />
        Modeli kontrol et
      </Button>
      <Feedback state={state} />
    </form>
  );
}
