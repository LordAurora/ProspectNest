import type { ObservationStatus, Priority } from './domain';
import type { RuleCondition, RuleSet, Signal } from './rules';

export type EvidenceInput = {
  id: string;
  signal: string;
  status: ObservationStatus;
  excerpt: string | null;
  fetchedAt: Date;
};

export type RuleResult = {
  ruleId: string;
  signal: Signal;
  when: RuleCondition;
  /** What the evidence says about the signal. Missing evidence is `unknown`. */
  status: ObservationStatus;
  fired: boolean;
  /** Points actually applied (0 when the rule did not fire). */
  impact: number;
  evidenceIds: string[];
};

export type Evaluation = {
  score: number;
  /** Share of enabled rules whose signal could be evaluated (0–1). */
  evidenceCoverage: number;
  /** 0–2: public e-mail and/or phone found. Independent from the need score. */
  contactability: number;
  priority: Priority;
  results: RuleResult[];
  evidenceIds: string[];
};

/** Below this coverage the score is kept but the lead is not prioritised. */
export const MIN_COVERAGE = 0.5;
export const HIGH_PRIORITY_SCORE = 65;
export const MEDIUM_PRIORITY_SCORE = 45;

/** Signals whose "present" claim is only accepted with a real quoted excerpt. */
const EXCERPT_REQUIRED: ReadonlySet<string> = new Set(['menu_by_phone_request']);

function signalState(signal: Signal, evidence: EvidenceInput[]): { status: ObservationStatus; ids: string[] } {
  const relevant = evidence
    .filter((e) => e.signal === signal)
    .sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime());
  const latest = relevant[0];
  if (!latest) return { status: 'unknown', ids: [] };
  // A need claim without its quote is treated as unverified rather than true.
  if (latest.status === 'present' && EXCERPT_REQUIRED.has(signal) && !latest.excerpt?.trim()) {
    return { status: 'unknown', ids: [latest.id] };
  }
  return { status: latest.status, ids: [latest.id] };
}

/**
 * Deterministic, explainable scoring. The score is a 0–100 priority hint
 * derived only from recorded evidence; it is not a purchase probability.
 */
export function evaluate(ruleSet: RuleSet, evidence: EvidenceInput[], contacts: { email: number; phone: number }): Evaluation {
  const enabled = ruleSet.rules.filter((rule) => rule.enabled);
  const results: RuleResult[] = enabled.map((rule) => {
    const state = signalState(rule.signal, evidence);
    const fired = state.status !== 'unknown' && state.status === rule.when;
    return {
      ruleId: rule.id,
      signal: rule.signal,
      when: rule.when,
      status: state.status,
      fired,
      impact: fired ? rule.impact : 0,
      evidenceIds: state.ids,
    };
  });

  const evaluable = results.filter((r) => r.status !== 'unknown').length;
  const evidenceCoverage = enabled.length === 0 ? 0 : evaluable / enabled.length;
  const raw = results.reduce((sum, r) => sum + r.impact, ruleSet.baseScore);
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  let priority: Priority;
  if (enabled.length === 0 || evidenceCoverage < MIN_COVERAGE) priority = 'not_evaluated';
  else if (score >= HIGH_PRIORITY_SCORE) priority = 'high';
  else if (score >= MEDIUM_PRIORITY_SCORE) priority = 'medium';
  else priority = 'low';

  const contactability = (contacts.email > 0 ? 1 : 0) + (contacts.phone > 0 ? 1 : 0);
  const evidenceIds = [...new Set(results.flatMap((r) => r.evidenceIds))].sort();

  return { score, evidenceCoverage, contactability, priority, results, evidenceIds };
}
