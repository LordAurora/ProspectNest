'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

type CampaignOption = { id: string; name: string };

/** Scopes the business list to one campaign via the `campaign` search param. */
export function CampaignSwitcher({ campaigns }: { campaigns: CampaignOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get('campaign') ?? '';

  return (
    <div className="relative hidden md:block">
      <label htmlFor="campaign-switcher" className="sr-only">
        Kampanya
      </label>
      <select
        id="campaign-switcher"
        value={current}
        onChange={(event) => {
          const value = event.target.value;
          router.push(value ? `/businesses?campaign=${encodeURIComponent(value)}` : '/businesses');
        }}
        className="h-9 max-w-[240px] appearance-none truncate rounded-control border border-border bg-surface pr-8 pl-3 text-[13px] font-medium text-fg transition-colors duration-150 hover:border-border-strong"
      >
        <option value="">Tüm kampanyalar</option>
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-subtle"
        aria-hidden
      />
    </div>
  );
}
