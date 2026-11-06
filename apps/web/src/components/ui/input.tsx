import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const controlClass = cn(
  'h-9 w-full rounded-control border border-border-strong bg-surface px-3 text-sm text-fg',
  'placeholder:text-fg-subtle transition-colors duration-150',
  'hover:border-fg-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--ring)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-invalid:border-danger',
);

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(controlClass, className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(controlClass, 'pr-8', className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(controlClass, 'h-auto min-h-[88px] py-2 leading-relaxed', className)} {...props} />;
  },
);

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[12px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}
