'use client';

import { useActionState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { login, type LoginState } from './actions';

export function LoginForm({ next }: { next: string | undefined }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.error ? (
        <div role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </div>
      ) : null}
      <Field label="E-posta" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          autoFocus
        />
      </Field>
      <Field label="Parola" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
        />
      </Field>
      <Button type="submit" variant="primary" loading={pending} className="mt-1 w-full">
        Giriş yap
      </Button>
    </form>
  );
}
