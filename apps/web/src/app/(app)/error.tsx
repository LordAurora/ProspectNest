'use client';

import { useEffect } from 'react';
import { CircleAlert, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Panel className="mx-auto mt-8 max-w-lg px-6 py-8 text-center">
      <CircleAlert className="mx-auto mb-3 size-6 text-danger" aria-hidden />
      <h1 className="text-[16px] font-semibold text-fg">Sayfa yüklenemedi</h1>
      <p className="mt-1 text-[13px] text-fg-muted">
        Veritabanına ulaşılamamış olabilir. Bağlantıyı kontrol edip yeniden deneyin.
      </p>
      {error.digest ? <p className="mt-3 font-mono text-[12px] text-fg-subtle">Hata kodu: {error.digest}</p> : null}
      <Button variant="secondary" className="mt-5" onClick={reset}>
        <RotateCw aria-hidden />
        Yeniden dene
      </Button>
    </Panel>
  );
}
