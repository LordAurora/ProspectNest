'use client';

import { useState, useTransition } from 'react';
import { GitMerge, Split } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveDuplicate } from './actions';

export function DecisionButtons({ duplicateId, name }: { duplicateId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (decision: 'merge' | 'separate') =>
    startTransition(async () => {
      const result = await resolveDuplicate(duplicateId, decision);
      if (result.error) setError(result.error);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="primary" loading={pending} onClick={() => decide('merge')} aria-label={`${name}: tek kayıtta birleştir`}>
        <GitMerge aria-hidden />
        Birleştir
      </Button>
      <Button size="sm" disabled={pending} onClick={() => decide('separate')} aria-label={`${name}: ayrı işletme olarak tut`}>
        <Split aria-hidden />
        Ayrı tut
      </Button>
      {error ? <span className="text-[12px] text-danger">{error}</span> : null}
    </div>
  );
}
