import { Info } from 'lucide-react';

/**
 * States the Google Maps Platform limits plainly, so discovery is never
 * presented as a way to build a stored or exported lead list.
 */
export function PlacesTermsNote() {
  return (
    <div className="flex gap-2 border-t border-border bg-surface-muted px-4 py-3 text-[12px] text-fg-muted">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <p>
        Google koşulları gereği yalnız işletmenin <strong className="font-medium text-fg">place_id</strong> değeri saklanır. Ad, adres, telefon ve web
        sitesi her görüntülemede Google&apos;dan canlı alınır; veritabanına kaydedilmez, Sheets/Excel/CSV&apos;ye aktarılmaz ve kampanya listesine
        kopyalanmaz. Bu nedenle Google Places, kalıcı bir müşteri listesi oluşturma amacını <strong className="font-medium text-fg">karşılamaz</strong>;
        kalıcı liste için izinli CSV veya manuel kayıt kullanın.
      </p>
    </div>
  );
}
