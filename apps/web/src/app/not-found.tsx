import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-[13px] font-medium text-fg-muted tabular-nums">404</p>
      <h1 className="mt-1 text-[20px] font-semibold text-fg">Sayfa bulunamadı</h1>
      <p className="mt-1 text-[14px] text-fg-muted">Bağlantı eski olabilir veya kayıt silinmiş olabilir.</p>
      <Link href="/" className={`${buttonClass()} mt-5`}>
        Genel bakışa dön
      </Link>
    </main>
  );
}
