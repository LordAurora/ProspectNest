'use client';

import { useActionState } from 'react';
import { CircleAlert, MapPinned } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { startDiscovery, type RunActionState } from '@/app/(app)/runs/actions';

export function DiscoveryForm({
  campaignId,
  country,
  cities,
  categories,
  disabled,
}: {
  campaignId: string;
  country: string;
  cities: string[];
  categories: string[];
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<RunActionState, FormData>(startDiscovery.bind(null, campaignId), {});
  return (
    <form action={action} className="flex flex-col gap-3 px-4 py-4 text-[13px]">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ülke" htmlFor="discovery-country" hint="ISO kodu, ör. TR">
          <Input id="discovery-country" name="country" defaultValue={country} maxLength={60} />
        </Field>
        <Field label="Şehir" htmlFor="discovery-city">
          <Input id="discovery-city" name="city" defaultValue={cities[0] ?? ''} list="discovery-cities" required maxLength={80} />
        </Field>
        <Field label="İlçe (isteğe bağlı)" htmlFor="discovery-district">
          <Input id="discovery-district" name="district" maxLength={80} />
        </Field>
        <Field label="İşletme türü" htmlFor="discovery-category">
          <Input id="discovery-category" name="category" defaultValue={categories[0] ?? ''} list="discovery-categories" required maxLength={80} />
        </Field>
      </div>
      <datalist id="discovery-cities">
        {cities.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      <datalist id="discovery-categories">
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="En fazla sonuç" htmlFor="discovery-max">
          <Select id="discovery-max" name="maxResults" defaultValue="20" className="w-auto">
            <option value="20">20 (1 istek)</option>
            <option value="40">40 (2 istek)</option>
            <option value="60">60 (3 istek, en fazla)</option>
          </Select>
        </Field>
        <Button type="submit" variant="primary" loading={pending} disabled={disabled}>
          <MapPinned aria-hidden />
          İşletmeleri bul
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="flex items-center gap-1.5 text-danger">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
