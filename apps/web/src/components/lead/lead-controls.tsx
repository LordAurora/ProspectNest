'use client';

import { useActionState, useState, useTransition } from 'react';
import { CircleCheck } from 'lucide-react';
import { LEAD_STATUSES, leadStatusLabel, type LeadStatus } from '@prospectnest/core';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/input';
import { saveLeadNotes, updateLeadStatus } from '@/app/(app)/businesses/actions';

export function LeadStatusSelect({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={`status-${leadId}`} className="sr-only">
        Takip durumu
      </label>
      <Select
        id={`status-${leadId}`}
        value={value}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as LeadStatus;
          const previous = value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const result = await updateLeadStatus(leadId, next);
            if (result.error) {
              setValue(previous);
              setError(result.error);
            }
          });
        }}
        className="h-8 w-auto text-[13px]"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {leadStatusLabel[s]}
          </option>
        ))}
      </Select>
      {error ? <span className="text-[12px] text-danger">{error}</span> : null}
    </div>
  );
}

export function LeadNotes({ leadId, notes }: { leadId: string; notes: string | null }) {
  const [state, action, pending] = useActionState(saveLeadNotes.bind(null, leadId), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor={`notes-${leadId}`} className="sr-only">
        Notlar
      </label>
      <Textarea id={`notes-${leadId}`} name="notes" defaultValue={notes ?? ''} maxLength={5000} placeholder="Görüşme notu, sonraki adım…" />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" loading={pending}>
          Notu kaydet
        </Button>
        {state.message ? (
          <span role="status" className="flex items-center gap-1 text-[12px] text-fg-muted">
            <CircleCheck className="size-3.5 text-success" aria-hidden />
            {state.message}
          </span>
        ) : null}
        {state.error ? <span className="text-[12px] text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}
