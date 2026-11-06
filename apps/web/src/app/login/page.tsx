import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { Wordmark } from '@/components/shell/sidebar';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Giriş' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect('/');
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <Wordmark />
        </div>
        <div className="rounded-panel border border-border bg-surface p-6 sm:p-7">
          <h1 className="text-[18px] font-semibold text-fg">Yönetici girişi</h1>
          <p className="mt-1 mb-6 text-[13px] text-fg-muted">Çalışma alanına erişmek için giriş yapın.</p>
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-[12px] text-fg-muted">
          Hesap kurulum komutuyla oluşturulur: <code className="font-mono">pnpm admin:create</code>
        </p>
      </div>
    </main>
  );
}
