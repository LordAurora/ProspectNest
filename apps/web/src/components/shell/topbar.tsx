import Link from 'next/link';
import { Suspense } from 'react';
import { Search } from 'lucide-react';
import type { WorkerState } from '@/lib/system';
import type { Theme } from '@/lib/theme';
import { StatusDot } from '@/components/ui/badge';
import { CampaignSwitcher } from './campaign-switcher';
import { MobileNav } from './sidebar';
import { ThemeToggle } from './theme-toggle';

const workerLabel: Record<WorkerState['status'], string> = {
  online: 'Worker çalışıyor',
  stale: 'Worker yanıt vermiyor',
  never: 'Worker başlatılmadı',
};

export function Topbar({
  user,
  campaigns,
  worker,
  theme,
}: {
  user: { email: string; name: string | null };
  campaigns: { id: string; name: string }[];
  worker: WorkerState;
  theme: Theme;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-border bg-surface px-4 lg:px-8">
      <MobileNav user={user} />
      <Suspense>
        <CampaignSwitcher campaigns={campaigns} />
      </Suspense>
      <form action="/businesses" role="search" className="relative min-w-0 flex-1 md:max-w-[360px]">
        <label htmlFor="global-search" className="sr-only">
          İşletme ara
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input
          id="global-search"
          name="q"
          type="search"
          placeholder="İşletme, şehir veya domain ara"
          className="h-9 w-full rounded-control border border-border bg-surface-muted pr-3 pl-9 text-[13px] text-fg placeholder:text-fg-subtle transition-colors duration-150 focus-visible:border-accent focus-visible:bg-surface focus-visible:outline-none"
        />
      </form>
      <div className="ml-auto flex items-center gap-1">
        <Link
          href="/integrations"
          className="hidden h-9 items-center rounded-control px-2.5 transition-colors duration-150 hover:bg-surface-hover sm:flex"
        >
          <StatusDot
            tone={worker.status === 'online' ? 'success' : worker.status === 'stale' ? 'danger' : 'warning'}
            label={workerLabel[worker.status]}
          />
        </Link>
        <ThemeToggle initial={theme} />
      </div>
    </header>
  );
}
