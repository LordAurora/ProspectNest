'use client';

import { useActionState, useEffect, useRef } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { changePassword, type PasswordState } from './actions';

const fields = [
  { name: 'current', label: 'Mevcut parola', autoComplete: 'current-password' },
  { name: 'next', label: 'Yeni parola', autoComplete: 'new-password', hint: 'En az 12 karakter.' },
  { name: 'confirm', label: 'Yeni parola (tekrar)', autoComplete: 'new-password' },
] as const;

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4 px-4 py-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        {fields.map((field) => (
          <Field
            key={field.name}
            label={field.label}
            htmlFor={`password-${field.name}`}
            hint={'hint' in field ? field.hint : undefined}
            error={state.fieldErrors?.[field.name]}
          >
            <Input
              id={`password-${field.name}`}
              name={field.name}
              type="password"
              autoComplete={field.autoComplete}
              required
              aria-invalid={state.fieldErrors?.[field.name] ? true : undefined}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          Parolayı değiştir
        </Button>
        {state.message ? (
          <p role="status" className="flex items-center gap-1.5 text-[13px] text-fg-muted">
            <CircleCheck className="size-4 text-success" aria-hidden />
            {state.message}
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="flex items-center gap-1.5 text-[13px] text-danger">
            <CircleAlert className="size-4" aria-hidden />
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
