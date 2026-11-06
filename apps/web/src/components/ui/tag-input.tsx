'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Free-text list input: Enter or comma adds a value, Backspace on empty input removes the last one. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  describedBy,
}: {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const additions = raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '' && !value.some((v) => v.toLocaleLowerCase('tr-TR') === part.toLocaleLowerCase('tr-TR')));
    if (additions.length > 0) onChange([...value, ...additions]);
    setDraft('');
  };

  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1.5 rounded-control border bg-surface px-2 py-1 transition-colors duration-150',
        'focus-within:border-accent focus-within:ring-3 focus-within:ring-[var(--ring)]',
        invalid ? 'border-danger' : 'border-border-strong hover:border-fg-subtle',
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-[5px] bg-surface-muted pr-1 pl-2 text-[13px] text-fg">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== tag))}
            className="flex size-4 items-center justify-center rounded-[3px] text-fg-subtle hover:bg-surface-hover hover:text-fg"
            aria-label={`${tag} kaldır`}
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          if (next.includes(',')) commit(next);
          else setDraft(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(draft);
          } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={value.length === 0 ? placeholder : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-7 min-w-[120px] flex-1 bg-transparent px-1 text-sm text-fg outline-none placeholder:text-fg-subtle"
      />
    </div>
  );
}
