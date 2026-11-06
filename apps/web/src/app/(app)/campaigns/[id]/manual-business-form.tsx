'use client';

import { useActionState, useEffect, useRef } from 'react';
import { CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { addManualBusiness, type ManualBusinessState } from '../actions';

const fields = [
  { name: 'name', label: 'İşletme adı', required: true, autoComplete: 'organization' },
  { name: 'website', label: 'Web sitesi', placeholder: 'ornek.com' },
  { name: 'phone', label: 'Telefon', type: 'tel' },
  { name: 'email', label: 'E-posta', type: 'email' },
  { name: 'city', label: 'Şehir' },
  { name: 'district', label: 'İlçe / semt' },
  { name: 'category', label: 'Kategori' },
  { name: 'address', label: 'Adres' },
] as const;

export function ManualBusinessForm({ campaignId }: { campaignId: string }) {
  const [state, action, pending] = useActionState<ManualBusinessState, FormData>(
    addManualBusiness.bind(null, campaignId),
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4 px-4 py-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <Field key={field.name} label={field.label} htmlFor={`manual-${field.name}`} error={state.errors?.[field.name]}>
            <Input
              id={`manual-${field.name}`}
              name={field.name}
              type={'type' in field ? field.type : 'text'}
              placeholder={'placeholder' in field ? field.placeholder : undefined}
              required={'required' in field}
              aria-invalid={state.errors?.[field.name] ? true : undefined}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          İşletmeyi ekle
        </Button>
        {state.message ? (
          <p role="status" className="flex items-center gap-1.5 text-[13px] text-fg-muted">
            <CircleCheck className="size-4 text-success" aria-hidden />
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
