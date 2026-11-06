'use client';

import { useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleAlert, Plus, Trash2 } from 'lucide-react';
import {
  RULE_CONDITIONS,
  SERVICE_TEMPLATES,
  campaignInputSchema,
  defaultRuleSet,
  ruleConditionLabel,
  serviceTemplateLabel,
  serviceTemplates,
  signalLabel,
  type CampaignInput,
  type CampaignSource,
  type Rule,
  type RuleCondition,
  type ServiceTemplate,
  type Signal,
} from '@prospectnest/core';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Panel } from '@/components/ui/panel';
import { TagInput } from '@/components/ui/tag-input';
import { createCampaign, type FieldErrors } from '../actions';

type Draft = Omit<CampaignInput, 'ruleSet' | 'dailyNewLimit' | 'dailyPageBudget' | 'recheckIntervalDays'> & {
  ruleSet: { baseScore: number; rules: Rule[] };
  dailyNewLimit: number;
  dailyPageBudget: number;
  recheckIntervalDays: number;
};

const STEPS = [
  { title: 'Hizmet', fields: ['name', 'template', 'serviceDescription'] },
  { title: 'Hedef bölge ve kategori', fields: ['countries', 'cities', 'categories', 'language'] },
  { title: 'Kaynak, program ve kurallar', fields: ['source', 'dailyNewLimit', 'dailyPageBudget', 'recheckIntervalDays', 'timezone', 'ruleSet'] },
  { title: 'Önizleme', fields: [] },
] as const;

const sourceOptions: { value: CampaignSource; label: string; description: string }[] = [
  { value: 'csv', label: 'CSV dosyası', description: 'Size ait veya kullanım izniniz olan bir listeyi yükleyin.' },
  { value: 'manual', label: 'Manuel giriş', description: 'İşletmeleri tek tek ekleyin.' },
  { value: 'discovery', label: 'Canlı keşif', description: 'Yapılandırılmış bir keşif sağlayıcısından işletme bulur.' },
];

function initialDraft(): Draft {
  return {
    name: '',
    serviceDescription: '',
    template: 'qr_menu',
    countries: ['TR'],
    cities: [],
    categories: [],
    language: 'tr',
    timezone: 'Europe/Istanbul',
    source: 'csv',
    dailyNewLimit: 50,
    dailyPageBudget: 250,
    recheckIntervalDays: 7,
    ruleSet: defaultRuleSet('qr_menu'),
  };
}

function validate(draft: Draft): FieldErrors {
  const result = campaignInputSchema.safeParse(draft);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}

export function CampaignWizard({ discovery }: { discovery: { ready: boolean; reason: string } }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const { [key as string]: _removed, ...rest } = current;
      return rest;
    });
  };

  const stepErrors = (index: number, all: FieldErrors) =>
    Object.fromEntries(Object.entries(all).filter(([key]) => (STEPS[index]?.fields as readonly string[]).includes(key)));

  const goNext = () => {
    const current = stepErrors(step, validate(draft));
    if (Object.keys(current).length > 0) {
      setErrors(current);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = () => {
    const all = validate(draft);
    if (Object.keys(all).length > 0) {
      setErrors(all);
      const firstStep = STEPS.findIndex((s, i) => Object.keys(stepErrors(i, all)).length > 0);
      if (firstStep >= 0) setStep(firstStep);
      return;
    }
    startTransition(async () => {
      const result = await createCampaign(draft);
      // A successful create redirects; we only get here with errors.
      if (result?.errors) setErrors(result.errors);
    });
  };

  const changeTemplate = (template: ServiceTemplate) => {
    setDraft((current) => ({ ...current, template, ruleSet: defaultRuleSet(template) }));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1" aria-label="Adımlar">
        {STEPS.map((s, index) => {
          const state = index < step ? 'done' : index === step ? 'current' : 'todo';
          return (
            <li key={s.title} className="shrink-0">
              <button
                type="button"
                onClick={() => index < step && setStep(index)}
                disabled={index > step}
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  'flex h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] transition-colors duration-150',
                  state === 'current' ? 'bg-surface font-medium text-fg shadow-[inset_0_0_0_1px_var(--border)]' : 'text-fg-muted',
                  state === 'done' && 'hover:bg-surface-hover hover:text-fg',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                    state === 'done' ? 'bg-accent text-accent-fg' : state === 'current' ? 'border border-accent text-accent' : 'border border-border-strong',
                  )}
                  aria-hidden
                >
                  {state === 'done' ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="whitespace-nowrap">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <Panel className="min-w-0">
        <div className="border-b border-border px-5 py-4">
          <p className="text-[12px] text-fg-muted tabular-nums">
            Adım {step + 1} / {STEPS.length}
          </p>
          <h2 className="text-[16px] font-semibold text-fg">{STEPS[step]?.title}</h2>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          {step === 0 ? <ServiceStep draft={draft} errors={errors} update={update} changeTemplate={changeTemplate} /> : null}
          {step === 1 ? <TargetStep draft={draft} errors={errors} update={update} /> : null}
          {step === 2 ? <SourceStep draft={draft} errors={errors} update={update} discovery={discovery} /> : null}
          {step === 3 ? <PreviewStep draft={draft} /> : null}
          {errors.form ? (
            <p role="alert" className="flex items-center gap-2 text-[13px] text-danger">
              <CircleAlert className="size-4" aria-hidden />
              {errors.form}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
            <ArrowLeft aria-hidden />
            Geri
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={goNext}>
              İleri
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button variant="primary" onClick={submit} loading={pending}>
              Kampanyayı oluştur
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}

type StepProps = {
  draft: Draft;
  errors: FieldErrors;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
};

function ServiceStep({ draft, errors, update, changeTemplate }: StepProps & { changeTemplate: (t: ServiceTemplate) => void }) {
  return (
    <>
      <Field label="Kampanya adı" htmlFor="name" error={errors.name}>
        <Input
          id="name"
          value={draft.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="ör. İzmir kafeleri — QR menü"
          aria-invalid={errors.name ? true : undefined}
          maxLength={120}
        />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-fg">Hizmet şablonu</legend>
        <p className="mb-2 text-[12px] text-fg-muted">Şablon, hangi sinyallerin aranacağını ve başlangıç kurallarını belirler.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SERVICE_TEMPLATES.map((template) => (
            <label
              key={template}
              className={cn(
                'flex cursor-pointer gap-3 rounded-control border px-3 py-2.5 transition-colors duration-150',
                draft.template === template ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong',
              )}
            >
              <input
                type="radio"
                name="template"
                value={template}
                checked={draft.template === template}
                onChange={() => changeTemplate(template)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-[14px] font-medium text-fg">{serviceTemplateLabel[template]}</span>
                <span className="block text-[12px] text-fg-muted">{serviceTemplates[template].description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Hizmet açıklaması"
        htmlFor="serviceDescription"
        hint="Ne sattığınızı kısaca yazın. Kayıtlarda ve isteğe bağlı yerel AI yorumunda bağlam olarak kullanılır."
        error={errors.serviceDescription}
      >
        <Textarea
          id="serviceDescription"
          value={draft.serviceDescription}
          onChange={(e) => update('serviceDescription', e.target.value)}
          aria-invalid={errors.serviceDescription ? true : undefined}
          maxLength={1000}
        />
      </Field>
    </>
  );
}

function TargetStep({ draft, errors, update }: StepProps) {
  const suggestions = serviceTemplates[draft.template].suggestedCategories.filter((c) => !draft.categories.includes(c));
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Ülkeler" htmlFor="countries" hint="ISO kodu veya ad; Enter ile ekleyin." error={errors.countries}>
          <TagInput id="countries" value={draft.countries} onChange={(v) => update('countries', v)} invalid={Boolean(errors.countries)} />
        </Field>
        <Field label="Dil" htmlFor="language">
          <Select id="language" value={draft.language} onChange={(e) => update('language', e.target.value as Draft['language'])}>
            <option value="tr">Türkçe</option>
            <option value="en">İngilizce</option>
          </Select>
        </Field>
      </div>
      <Field label="Şehirler" htmlFor="cities" hint="Boş bırakılırsa şehir filtresi uygulanmaz." error={errors.cities}>
        <TagInput id="cities" value={draft.cities} onChange={(v) => update('cities', v)} placeholder="ör. İzmir, Ankara" />
      </Field>
      <Field label="İşletme kategorileri" htmlFor="categories" error={errors.categories}>
        <TagInput
          id="categories"
          value={draft.categories}
          onChange={(v) => update('categories', v)}
          invalid={Boolean(errors.categories)}
          placeholder="ör. Kafe, Restoran"
        />
      </Field>
      {suggestions.length > 0 ? (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-fg-muted">Öneriler:</span>
          {suggestions.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => update('categories', [...draft.categories, category])}
              className="inline-flex h-6 items-center gap-1 rounded-[5px] border border-border px-2 text-[12px] text-fg-muted transition-colors duration-150 hover:border-border-strong hover:text-fg"
            >
              <Plus className="size-3" aria-hidden />
              {category}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function SourceStep({ draft, errors, update, discovery }: StepProps & { discovery: { ready: boolean; reason: string } }) {
  return (
    <>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-fg">İşletme kaynağı</legend>
        <div className="flex flex-col gap-2">
          {sourceOptions.map((option) => {
            const disabled = option.value === 'discovery' && !discovery.ready;
            return (
              <label
                key={option.value}
                className={cn(
                  'flex gap-3 rounded-control border px-3 py-2.5 transition-colors duration-150',
                  disabled ? 'cursor-not-allowed border-border opacity-70' : 'cursor-pointer',
                  !disabled && (draft.source === option.value ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong'),
                )}
              >
                <input
                  type="radio"
                  name="source"
                  value={option.value}
                  checked={draft.source === option.value}
                  disabled={disabled}
                  onChange={() => update('source', option.value)}
                  className="mt-1 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-fg">
                    {option.label}
                    {disabled ? (
                      <span className="rounded-[5px] bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">Bağlantı gerekli</span>
                    ) : null}
                  </span>
                  <span className="block text-[12px] text-fg-muted">{disabled ? discovery.reason : option.description}</span>
                </span>
              </label>
            );
          })}
        </div>
        {errors.source ? <p className="mt-1.5 text-[12px] text-danger">{errors.source}</p> : null}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Günlük yeni kayıt" htmlFor="dailyNewLimit" error={errors.dailyNewLimit}>
          <Input id="dailyNewLimit" type="number" min={1} max={1000} value={draft.dailyNewLimit} onChange={(e) => update('dailyNewLimit', Number(e.target.value))} />
        </Field>
        <Field label="Günlük sayfa bütçesi" htmlFor="dailyPageBudget" error={errors.dailyPageBudget}>
          <Input id="dailyPageBudget" type="number" min={10} max={5000} value={draft.dailyPageBudget} onChange={(e) => update('dailyPageBudget', Number(e.target.value))} />
        </Field>
        <Field label="Yeniden kontrol (gün)" htmlFor="recheckIntervalDays" error={errors.recheckIntervalDays}>
          <Input id="recheckIntervalDays" type="number" min={1} max={90} value={draft.recheckIntervalDays} onChange={(e) => update('recheckIntervalDays', Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Saat dilimi" htmlFor="timezone" hint="Program saatleri bu dilime göre çalışır." error={errors.timezone}>
        <Input id="timezone" value={draft.timezone} onChange={(e) => update('timezone', e.target.value)} className="sm:max-w-xs" />
      </Field>

      <RuleEditor draft={draft} update={update} error={errors.ruleSet} />
    </>
  );
}

function RuleEditor({ draft, update, error }: { draft: Draft; update: StepProps['update']; error: string | undefined }) {
  const { ruleSet, template } = draft;
  const signals = serviceTemplates[template].signals;
  const used = new Set(ruleSet.rules.map((r) => `${r.signal}:${r.when}`));
  const available = signals.flatMap((signal) => RULE_CONDITIONS.map((when) => ({ signal, when }))).filter((o) => !used.has(`${o.signal}:${o.when}`));

  const setRules = (rules: Rule[]) => update('ruleSet', { ...ruleSet, rules });
  const patch = (id: string, change: Partial<Rule>) =>
    setRules(ruleSet.rules.map((rule) => (rule.id === id ? { ...rule, ...change, id: change.signal || change.when ? `${change.signal ?? rule.signal}_${change.when ?? rule.when}` : rule.id } : rule)));

  return (
    <fieldset className="rounded-control border border-border">
      <legend className="sr-only">Puanlama kuralları</legend>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <div>
          <p className="text-[13px] font-medium text-fg">Puanlama kuralları</p>
          <p className="text-[12px] text-fg-muted">Puan 0–100 arası bir öncelik ipucudur; satın alma olasılığı değildir.</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-fg-muted">
          Başlangıç puanı
          <Input
            type="number"
            min={0}
            max={100}
            value={ruleSet.baseScore}
            onChange={(e) => update('ruleSet', { ...ruleSet, baseScore: Number(e.target.value) })}
            className="h-8 w-20 tabular-nums"
          />
        </label>
      </div>
      <ul className="divide-y divide-border">
        {ruleSet.rules.map((rule) => (
          <li key={rule.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => patch(rule.id, { enabled: e.target.checked })}
              aria-label={`${signalLabel[rule.signal]} kuralını etkinleştir`}
              className="size-4 accent-[var(--accent)]"
            />
            <span className={cn('min-w-0 flex-1 text-[13px]', rule.enabled ? 'text-fg' : 'text-fg-subtle line-through')}>
              <span className="font-medium">{signalLabel[rule.signal]}</span> {ruleConditionLabel[rule.when]}
            </span>
            <Select
              value={rule.when}
              onChange={(e) => patch(rule.id, { when: e.target.value as RuleCondition })}
              className="h-8 w-auto text-[13px]"
              aria-label="Koşul"
            >
              {RULE_CONDITIONS.map((when) => (
                <option key={when} value={when} disabled={when !== rule.when && used.has(`${rule.signal}:${when}`)}>
                  {ruleConditionLabel[when]}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min={-50}
              max={50}
              value={rule.impact}
              onChange={(e) => patch(rule.id, { impact: Number(e.target.value) })}
              className="h-8 w-20 text-right tabular-nums"
              aria-label={`${signalLabel[rule.signal]} etkisi`}
            />
            <button
              type="button"
              onClick={() => setRules(ruleSet.rules.filter((r) => r.id !== rule.id))}
              className="flex size-8 items-center justify-center rounded-control text-fg-subtle transition-colors duration-150 hover:bg-danger-soft hover:text-danger"
              aria-label={`${signalLabel[rule.signal]} kuralını sil`}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {available.length > 0 ? (
        <div className="border-t border-border px-3 py-2.5">
          <label htmlFor="add-rule" className="sr-only">
            Kural ekle
          </label>
          <Select
            id="add-rule"
            value=""
            onChange={(e) => {
              const [signal, when] = e.target.value.split(':') as [Signal, RuleCondition];
              if (signal && when) setRules([...ruleSet.rules, { id: `${signal}_${when}`, signal, when, impact: 0, enabled: true }]);
            }}
            className="h-8 w-auto text-[13px]"
          >
            <option value="">+ Kural ekle</option>
            {available.map(({ signal, when }) => (
              <option key={`${signal}:${when}`} value={`${signal}:${when}`}>
                {signalLabel[signal]} {ruleConditionLabel[when]}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {error ? <p className="border-t border-border px-3 py-2 text-[12px] text-danger">{error}</p> : null}
    </fieldset>
  );
}

function PreviewStep({ draft }: { draft: Draft }) {
  const enabled = draft.ruleSet.rules.filter((r) => r.enabled);
  const rows: [string, React.ReactNode][] = [
    ['Kampanya', draft.name],
    ['Şablon', serviceTemplateLabel[draft.template]],
    ['Hizmet', draft.serviceDescription],
    ['Bölge', [draft.countries.join(', '), draft.cities.join(', ') || 'Tüm şehirler'].join(' · ')],
    ['Kategoriler', draft.categories.join(', ')],
    ['Kaynak', sourceOptions.find((o) => o.value === draft.source)?.label],
    [
      'Sınırlar',
      `Günde en fazla ${draft.dailyNewLimit} yeni kayıt ve ${draft.dailyPageBudget} sayfa; mevcut kayıtlar ${draft.recheckIntervalDays} günde bir yeniden kontrol edilir.`,
    ],
    ['Saat dilimi', draft.timezone],
    [
      'Kurallar',
      <ul key="rules" className="flex flex-col gap-0.5">
        <li className="text-fg-muted">Başlangıç puanı {draft.ruleSet.baseScore}</li>
        {enabled.map((rule) => (
          <li key={rule.id}>
            {signalLabel[rule.signal]} {ruleConditionLabel[rule.when]}{' '}
            <span className={cn('font-medium tabular-nums', rule.impact > 0 ? 'text-success' : rule.impact < 0 ? 'text-danger' : 'text-fg-muted')}>
              {rule.impact > 0 ? `+${rule.impact}` : rule.impact}
            </span>
          </li>
        ))}
      </ul>,
    ],
  ];
  return (
    <>
      <dl className="grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-[140px_minmax(0,1fr)]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="break-words text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="rounded-control bg-surface-muted px-3 py-2.5 text-[12px] text-fg-muted">
        Erişilemeyen sayfalar olumsuz kanıt sayılmaz; yetersiz kanıtlı işletmeler &quot;Değerlendirilemedi&quot; olarak kalır.
      </p>
    </>
  );
}
