'use client';

import { useActionState } from 'react';
import { CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { updateSchedule, type ScheduleState } from '../actions';

export function ScheduleForm({
  campaignId,
  enabled,
  recheckHour,
  timezone,
}: {
  campaignId: string;
  enabled: boolean;
  recheckHour: number;
  timezone: string;
}) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(updateSchedule.bind(null, campaignId), {});
  return (
    <form action={action} className="flex flex-col gap-3 px-4 py-4 text-[13px]">
      <label className="flex items-start gap-2.5">
        <input type="checkbox" name="scheduleEnabled" defaultChecked={enabled} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>
          <span className="font-medium text-fg">Otomatik yeniden kontrol</span>
          <span className="block text-[12px] text-fg-muted">
            Bulguları aralıktan eski işletmeler günde bir kez yeniden araştırılır. Bilgisayar kapalı kaldıysa açıldığında tek bir telafi çalışması yapılır.
          </span>
        </span>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-fg-muted">
        Başlangıç saati
        <Select name="recheckHour" defaultValue={String(recheckHour)} className="h-8 w-auto text-[13px]">
          {Array.from({ length: 24 }, (_, hour) => (
            <option key={hour} value={hour}>
              {String(hour).padStart(2, '0')}:00
            </option>
          ))}
        </Select>
        <span className="text-[12px]">({timezone})</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" loading={pending}>
          Programı kaydet
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
