import { z } from 'zod';
import { SERVICE_TEMPLATES, type ServiceTemplate } from './domain';

/**
 * Rule DSL. A rule only references a signal from this catalog, a condition and
 * a bounded weight — never executable code. New signals require a code change
 * in the research extractor, so users can only combine what the system can observe.
 */
export const SIGNALS = [
  'website_present',
  'social_only',
  'pdf_or_image_menu',
  'menu_by_phone_request',
  'digital_menu_link',
  'online_booking_link',
  'reservation_widget',
  'ecommerce_cart',
  'whatsapp_contact',
] as const;
export type Signal = (typeof SIGNALS)[number];

export const signalLabel: Record<Signal, string> = {
  website_present: 'Web sitesi var',
  social_only: 'Yalnızca sosyal medya bağlantısı',
  pdf_or_image_menu: 'PDF veya görsel menü',
  menu_by_phone_request: 'Menü telefon/mesajla isteniyor',
  digital_menu_link: 'Çalışan dijital menü bağlantısı',
  online_booking_link: 'Online randevu bağlantısı',
  reservation_widget: 'Online rezervasyon aracı',
  ecommerce_cart: 'Online sipariş veya sepet',
  whatsapp_contact: 'WhatsApp ile iletişim',
};

export const RULE_CONDITIONS = ['present', 'not_observed'] as const;
export type RuleCondition = (typeof RULE_CONDITIONS)[number];

export const ruleConditionLabel: Record<RuleCondition, string> = {
  present: 'bulunursa',
  not_observed: 'incelenen sayfalarda bulunamazsa',
};

export const MAX_RULE_IMPACT = 50;

export const ruleSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  signal: z.enum(SIGNALS),
  when: z.enum(RULE_CONDITIONS),
  impact: z.number().int().min(-MAX_RULE_IMPACT).max(MAX_RULE_IMPACT),
  enabled: z.boolean().default(true),
});
export type Rule = z.infer<typeof ruleSchema>;

export const ruleSetSchema = z.object({
  baseScore: z.number().int().min(0).max(100),
  rules: z
    .array(ruleSchema)
    .max(20)
    .refine((rules) => new Set(rules.map((r) => r.id)).size === rules.length, 'Kural kimlikleri benzersiz olmalı')
    .refine(
      (rules) => new Set(rules.map((r) => `${r.signal}:${r.when}`)).size === rules.length,
      'Aynı sinyal ve koşul için birden fazla kural tanımlanamaz',
    ),
});
export type RuleSet = z.infer<typeof ruleSetSchema>;

type TemplateDefinition = {
  description: string;
  suggestedCategories: string[];
  /** Signals offered in the rule builder for this template. */
  signals: Signal[];
  ruleSet: RuleSet;
};

const rule = (signal: Signal, when: RuleCondition, impact: number): Rule => ({
  id: `${signal}_${when}`,
  signal,
  when,
  impact,
  enabled: true,
});

// Starting weights are product assumptions, to be calibrated with real usage.
// The score is a priority hint, not a purchase probability.
export const serviceTemplates: Record<ServiceTemplate, TemplateDefinition> = {
  qr_menu: {
    description: 'Restoran ve kafelere dijital/QR menü',
    suggestedCategories: ['Restoran', 'Kafe', 'Bar', 'Pastane', 'Lokanta'],
    signals: ['pdf_or_image_menu', 'menu_by_phone_request', 'digital_menu_link', 'whatsapp_contact', 'website_present'],
    ruleSet: {
      baseScore: 50,
      rules: [
        rule('pdf_or_image_menu', 'present', 15),
        rule('menu_by_phone_request', 'present', 10),
        rule('digital_menu_link', 'present', -35),
      ],
    },
  },
  website: {
    description: 'Web sitesi olmayan veya yalnız sosyal medyası olan işletmelere site',
    suggestedCategories: ['Kuaför', 'Oto servis', 'Klinik', 'Mağaza', 'Restoran'],
    signals: ['website_present', 'social_only', 'whatsapp_contact'],
    ruleSet: {
      baseScore: 50,
      rules: [rule('website_present', 'not_observed', 30), rule('social_only', 'present', 15), rule('website_present', 'present', -20)],
    },
  },
  appointment: {
    description: 'Kuaför, klinik ve stüdyolara online randevu',
    suggestedCategories: ['Kuaför', 'Güzellik salonu', 'Diş kliniği', 'Fizyoterapi', 'Spor stüdyosu'],
    signals: ['online_booking_link', 'whatsapp_contact', 'website_present'],
    ruleSet: {
      baseScore: 50,
      rules: [rule('online_booking_link', 'present', -35), rule('whatsapp_contact', 'present', 10)],
    },
  },
  reservation: {
    description: 'Restoran ve otellere online rezervasyon',
    suggestedCategories: ['Restoran', 'Otel', 'Pansiyon', 'Beach club'],
    signals: ['reservation_widget', 'whatsapp_contact', 'website_present'],
    ruleSet: {
      baseScore: 50,
      rules: [rule('reservation_widget', 'present', -35), rule('whatsapp_contact', 'present', 10)],
    },
  },
  ecommerce: {
    description: 'Fiziksel mağazalara online satış',
    suggestedCategories: ['Butik', 'Kırtasiye', 'Çiçekçi', 'Şarküteri'],
    signals: ['ecommerce_cart', 'whatsapp_contact', 'social_only', 'website_present'],
    ruleSet: {
      baseScore: 50,
      rules: [rule('ecommerce_cart', 'present', -40), rule('whatsapp_contact', 'present', 10), rule('social_only', 'present', 10)],
    },
  },
};

export const defaultRuleSet = (template: ServiceTemplate): RuleSet => structuredClone(serviceTemplates[template].ruleSet);

/** Rejects rules for signals the template does not offer. */
export function validateRuleSetForTemplate(template: ServiceTemplate, ruleSet: RuleSet): string | null {
  const allowed = new Set(serviceTemplates[template].signals);
  const invalid = ruleSet.rules.find((r) => !allowed.has(r.signal));
  return invalid ? `"${signalLabel[invalid.signal]}" bu şablonda kullanılamaz` : null;
}

export const isServiceTemplate = (value: string): value is ServiceTemplate =>
  (SERVICE_TEMPLATES as readonly string[]).includes(value);
