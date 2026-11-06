import { z } from 'zod';
import { SERVICE_TEMPLATES } from './domain';
import { ruleSetSchema, validateRuleSetForTemplate } from './rules';

const tagList = (max: number, label: string) =>
  z
    .array(z.string().trim().min(1).max(80))
    .max(max, `En fazla ${max} ${label}`)
    .transform((values) => [...new Set(values)]);

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const CAMPAIGN_SOURCES = ['csv', 'manual', 'discovery'] as const;
export type CampaignSource = (typeof CAMPAIGN_SOURCES)[number];

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(3, 'Kampanya adı en az 3 karakter olmalı').max(120),
    serviceDescription: z.string().trim().min(10, 'Hizmeti en az 10 karakterle açıklayın').max(1000),
    template: z.enum(SERVICE_TEMPLATES),
    countries: tagList(10, 'ülke').refine((v) => v.length > 0, 'En az bir ülke seçin'),
    cities: tagList(50, 'şehir'),
    categories: tagList(30, 'kategori').refine((v) => v.length > 0, 'En az bir kategori girin'),
    language: z.enum(['tr', 'en']),
    timezone: z.string().refine(isValidTimeZone, 'Geçerli bir IANA saat dilimi girin (ör. Europe/Istanbul)'),
    source: z.enum(CAMPAIGN_SOURCES),
    dailyNewLimit: z.coerce.number().int().min(1).max(1000),
    dailyPageBudget: z.coerce.number().int().min(10).max(5000),
    recheckIntervalDays: z.coerce.number().int().min(1).max(90),
    ruleSet: ruleSetSchema,
  })
  .superRefine((value, ctx) => {
    const error = validateRuleSetForTemplate(value.template, value.ruleSet);
    if (error) ctx.addIssue({ code: 'custom', path: ['ruleSet'], message: error });
  });

export type CampaignInput = z.input<typeof campaignInputSchema>;
export type CampaignData = z.output<typeof campaignInputSchema>;
