'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { NavList, primaryNav, secondaryNav } from './nav';

type SidebarUser = { email: string; name: string | null };

export function Wordmark() {
  return (
    <span className="text-[16px] font-semibold tracking-[-0.01em] text-fg">
      Prospect<span className="text-accent">Nest</span>
    </span>
  );
}

function SidebarContent({ user, onNavigate }: { user: SidebarUser; onNavigate?: () => void }) {
  const initial = (user.name ?? user.email).charAt(0).toLocaleUpperCase('tr-TR');
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[60px] shrink-0 items-center px-5">
        <Wordmark />
      </div>
      <nav aria-label="Ana menü" className="flex-1 overflow-y-auto px-3 py-2">
        <NavList items={primaryNav} onNavigate={onNavigate} />
      </nav>
      <div className="border-t border-border px-3 py-3">
        <NavList items={secondaryNav} onNavigate={onNavigate} />
        <div className="mt-2 flex items-center gap-2.5 px-2.5 py-1.5">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[12px] font-semibold text-fg-muted"
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-fg">{user.name ?? 'Yönetici'}</p>
            <p className="truncate text-[12px] text-fg-muted">{user.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ user }: { user: SidebarUser }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r border-border bg-surface lg:block">
      <SidebarContent user={user} />
    </aside>
  );
}

/** Below lg the sidebar becomes a drawer. Escape closes it and focus returns to the trigger. */
export function MobileNav({ user }: { user: SidebarUser }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      (previous ?? triggerRef.current)?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-1.5 flex size-9 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg lg:hidden"
        aria-label="Menüyü aç"
        aria-expanded={open}
      >
        <Menu className="size-5" aria-hidden />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Ana menü">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={panelRef}
            className="absolute inset-y-0 left-0 w-[264px] max-w-[85vw] border-r border-border bg-surface shadow-overlay"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover"
              aria-label="Menüyü kapat"
            >
              <X className="size-5" aria-hidden />
            </button>
            <SidebarContent user={user} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
