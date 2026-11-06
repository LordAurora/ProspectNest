import { cookies } from 'next/headers';
import { FlaskConical } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getWorkerState, hasDemoData } from '@/lib/system';
import { THEME_COOKIE, parseTheme } from '@/lib/theme';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [campaigns, worker, demo, cookieStore] = await Promise.all([
    db().campaign.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    }),
    getWorkerState(),
    hasDemoData(),
    cookies(),
  ]);

  return (
    <div className="min-h-dvh">
      <Sidebar user={user} />
      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-[232px]">
        {demo ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-1.5 text-center text-[12px] font-medium text-warning"
          >
            <FlaskConical className="size-3.5 shrink-0" aria-hidden />
            Demo modu: listedeki işletmeler sentetiktir, gerçek değildir ve dışa aktarılmamalıdır.
          </div>
        ) : null}
        <Topbar user={user} campaigns={campaigns} worker={worker} theme={parseTheme(cookieStore.get(THEME_COOKIE)?.value)} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
