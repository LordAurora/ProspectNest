'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Maximize2, X } from 'lucide-react';

/**
 * URL-driven side panel: open state lives in the search params, so the view is
 * shareable and the back button closes it. Escape closes, focus moves into the
 * panel on open and returns to the element that opened it.
 */
export function Drawer({
  label,
  closeHref,
  fullHref,
  children,
}: {
  label: string;
  closeHref: string;
  fullHref?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') router.push(closeHref, { scroll: false });
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [closeHref, router]);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={label}>
      <Link href={closeHref} scroll={false} className="absolute inset-0 bg-black/30" aria-label="Paneli kapat" tabIndex={-1} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-surface shadow-overlay outline-none sm:w-[520px]"
      >
        <div className="flex h-[52px] shrink-0 items-center justify-end gap-1 border-b border-border px-3">
          {fullHref ? (
            <Link
              href={fullHref}
              className="flex size-8 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg"
              aria-label="Tam sayfada aç"
              title="Tam sayfada aç"
            >
              <Maximize2 className="size-4" aria-hidden />
            </Link>
          ) : null}
          <Link
            href={closeHref}
            scroll={false}
            className="flex size-8 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg"
            aria-label="Paneli kapat"
          >
            <X className="size-4" aria-hidden />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
