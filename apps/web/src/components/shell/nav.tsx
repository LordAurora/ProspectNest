'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Building2, LayoutGrid, Plug, Settings, Target, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

type NavItem = { href: string; label: string; icon: LucideIcon };

export const primaryNav: NavItem[] = [
  { href: '/', label: 'Genel bakış', icon: LayoutGrid },
  { href: '/businesses', label: 'İşletmeler', icon: Building2 },
  { href: '/campaigns', label: 'Kampanyalar', icon: Target },
  { href: '/runs', label: 'Çalışmalar', icon: Activity },
  { href: '/integrations', label: 'Entegrasyonlar', icon: Plug },
];

export const secondaryNav: NavItem[] = [{ href: '/settings', label: 'Ayarlar', icon: Settings }];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-control px-2.5 text-[14px] transition-colors duration-150',
                active
                  ? 'bg-accent-soft font-medium text-fg'
                  : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
              )}
            >
              <Icon className={cn('size-[18px] shrink-0', active ? 'text-accent' : 'text-fg-subtle')} aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
