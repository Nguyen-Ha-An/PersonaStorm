/**
 * Counterfactual bias/sensitivity audit.
 *
 * The audit clones a small, deterministic sample of personas, changes exactly
 * one contextual field at a time, and re-runs the same stimulus through the
 * same reaction provider. Traits, budget, dealbreakers, product text, and the
 * persona id are intentionally preserved so large score movement is easier to
 * attribute to the changed context field rather than random sampling noise.
 *
 * This is a sensitivity detector, not proof of unfairness. A flagged pair says:
 * "investigate why this context label moved the reaction this much."
 */

import { round } from "../text";
import type { Persona, PersonaReaction } from "../types";
import { PERSONA_FEATURE_WIRING } from "../persona/featureWiring";

export type CounterfactualField =
  | "region"
  | "income_band"
  | "occupation"
  | "life_stage"
  | "decision_context.budget_control";

export interface CounterfactualPairSpec {
  audit_id: string;
  baseline_persona: Persona;
  counterfactual_persona: Persona;
  field: CounterfactualField;
  baseline_value: string | null;
  counterfactual_value: string | null;
  expected_inert: boolean;
}

export interface CounterfactualPairResult {
  audit_id: string;
  persona_id: string;
  field: CounterfactualField;
  baseline_value: string | null;
  counterfactual_value: string | null;
  baseline_buy_likelihood: number;
  counterfactual_buy_likelihood: number;
  delta_buy_likelihood: number;
  baseline_market_fit_score: number;
  counterfactual_market_fit_score: number;
  delta_market_fit_score: number;
  flagged: boolean;
  applicable: boolean;
}

export interface CounterfactualAudit {
  status: "not_run" | "pass" | "warn" | "fail";
  pairs_tested: number;
  pairs_not_applicable: number;
  fields_tested: CounterfactualField[];
  fields_not_applicable: CounterfactualField[];
  max_abs_buy_likelihood_delta: number;
  max_abs_market_fit_delta: number;
  flagged_pairs: CounterfactualPairResult[];
  summary: string;
  notes: string[];
}

const AUDIT_FIELDS: CounterfactualField[] = [
  "region",
  "income_band",
  "occupation",
  "life_stage",
  "decision_context.budget_control",
];

const LIFE_STAGE_FALLBACKS = [
  "teen_student",
  "student_young_adult",
  "early_career",
  "parent_family",
  "established_adult",
  "older_adult",
];

const REGION_FALLBACKS = ["Vietnam urban", "US - coastal metro", "EU - metro", "remote worldwide"];
const INCOME_FALLBACKS = ["student / family supported", "typical for segment", "department budget holder", "household budgeter"];
const OCCUPATION_FALLBACKS = ["student", "professional", "manager", "self-employed", "creator"];
const BUDGET_CONTROL_FALLBACKS = ["self", "allowance", "household budget", "employer/expense"];

const WARN_DELTA = 0.07;
const FLAG_DELTA = 0.12;
const MAX_COUNTERFACTUAL_PAIRS = 32;
const MAX_FLAGGED_PAIRS_TO_SURFACE = 8;

export function buildCounterfactualPairs(
  personas: Persona[],
  maxPairs = MAX_COUNTERFACTUAL_PAIRS,
  providerName = "mock",
): { pairs: CounterfactualPairSpec[]; notes: string[] } {
  if (personas.length === 0 || maxPairs <= 0) {
    return { pairs: [], notes: ["Counterfactual audit skipped: no personas available."] };
  }

  const pools = buildValuePools(personas);
  const baseCount = Math.min(personas.length, Math.max(1, Math.ceil(maxPairs / AUDIT_FIELDS.length)));
  const basePersonas = deterministicSpread(personas, baseCount);
  const pairs: CounterfactualPairSpec[] = [];

  for (const persona of basePersonas) {
    for (const field of AUDIT_FIELDS) {
      if (pairs.length >= maxPairs) break;
      const baseline = getFieldValue(persona, field);
      const replacement = chooseAlternative(baseline, pools[field], fallbackFor(field));
      if (replacement == null) continue;

      const counterfactual = setFieldValue(persona, field, replacement);
      pairs.push({
        audit_id: `${persona.persona_id}::${field}::${pairs.length}`,
        baseline_persona: persona,
        counterfactual_persona: counterfactual,
        field,
        baseline_value: baseline,
        counterfactual_value: replacement,
        expected_inert: providerName === "mock" && PERSONA_FEATURE_WIRING[field]?.mock === "flavor",
      });
    }
  }

  const notes = [
    "Counterfactual personas preserve traits, monthly budget, dealbreakers, stimulus, and persona id; only the named context field changes.",
    `Flag threshold: abs(delta buy_likelihood) >= ${FLAG_DELTA} or abs(delta market_fit_score) >= ${FLAG_DELTA}.`,
  ];

  if (pairs.length < maxPairs) {
    notes.push(`Only ${pairs.length} counterfactual pair(s) could be built from available context-field alternatives.`);
  }

  return { pairs, notes };
}

export function summarizeCounterfactualAudit(
  plan: CounterfactualPairSpec[],
  baselineReactions: PersonaReaction[],
  counterfactualReactions: PersonaReaction[],
  extraNotes: string[] = [],
): CounterfactualAudit {
  const baselineByPersona = new Map(baselineReactions.map((r) => [r.persona_id, r]));
  const results: CounterfactualPairResult[] = [];
  const notes = [...extraNotes];

  for (let i = 0; i < plan.length; i += 1) {
    const spec = plan[i];
    const baseline = baselineByPersona.get(spec.baseline_persona.persona_id);
    const counterfactual = counterfactualReactions[i];
    if (!baseline || !counterfactual) {
      notes.push(`Counterfactual pair '${spec.audit_id}' skipped because a paired reaction was missing.`);
      continue;
    }

    const deltaBuy = round(counterfactual.buy_likelihood - baseline.buy_likelihood, 3);
    const deltaMarket = round(counterfactual.market_fit_score - baseline.market_fit_score, 3);
    const applicable = !spec.expected_inert;
    const flagged = applicable && (Math.abs(deltaBuy) >= FLAG_DELTA || Math.abs(deltaMarket) >= FLAG_DELTA);

    if (spec.expected_inert && (deltaBuy !== 0 || deltaMarket !== 0)) {
      notes.push(
        `Wiring inconsistency: '${spec.field}' is declared flavor-only but moved the reaction — update PERSONA_FEATURE_WIRING.`,
      );
    }

    results.push({
      audit_id: spec.audit_id,
      persona_id: spec.baseline_persona.persona_id,
      field: spec.field,
      baseline_value: spec.baseline_value,
      counterfactual_value: spec.counterfactual_value,
      baseline_buy_likelihood: baseline.buy_likelihood,
      counterfactual_buy_likelihood: counterfactual.buy_likelihood,
      delta_buy_likelihood: deltaBuy,
      baseline_market_fit_score: baseline.market_fit_score,
      counterfactual_market_fit_score: counterfactual.market_fit_score,
      delta_market_fit_score: deltaMarket,
      flagged,
      applicable,
    });
  }

  if (results.length === 0) {
    return counterfactualAuditNotRun("Counterfactual audit produced no comparable reaction pairs.", notes);
  }

  const applicableResults = results.filter((r) => r.applicable);
  const notApplicable = results.filter((r) => !r.applicable);
  const fieldsNotApplicable = Array.from(new Set(notApplicable.map((r) => r.field)));

  const naSuffix = notApplicable.length > 0
    ? ` ${notApplicable.length} pair(s) not applicable: fields that cannot move reactions in this provider (${Array.from(new Set(notApplicable.map((r) => r.field))).join(", ")}).`
    : "";

  if (applicableResults.length === 0) {
    return counterfactualAuditNotRun(
      "All counterfactual pairs target fields that cannot move reactions in this provider — audit not meaningful in mock mode beyond life_stage.",
      notes,
      notApplicable.length,
      fieldsNotApplicable,
    );
  }

  const maxAbsBuy = round(Math.max(...applicableResults.map((r) => Math.abs(r.delta_buy_likelihood))), 3);
  const maxAbsMarket = round(Math.max(...applicableResults.map((r) => Math.abs(r.delta_market_fit_score))), 3);
  const flagged = applicableResults.filter((r) => r.flagged);
  const fields = Array.from(new Set(applicableResults.map((r) => r.field)));

  const status: CounterfactualAudit["status"] = flagged.length > 0
    ? "fail"
    : maxAbsBuy >= WARN_DELTA || maxAbsMarket >= WARN_DELTA
      ? "warn"
      : "pass";

  const summary = (status === "fail"
    ? `${flagged.length} counterfactual pair(s) exceeded the sensitivity threshold; inspect whether the changed context field is legitimately product-relevant.`
    : status === "warn"
      ? `Moderate counterfactual sensitivity detected, but no pair crossed the hard threshold.`
      : `No large counterfactual sensitivity found across ${applicableResults.length} tested pair(s).`) + naSuffix;

  return {
    status,
    pairs_tested: applicableResults.length,
    pairs_not_applicable: notApplicable.length,
    fields_tested: fields,
    fields_not_applicable: fieldsNotApplicable,
    max_abs_buy_likelihood_delta: maxAbsBuy,
    max_abs_market_fit_delta: maxAbsMarket,
    flagged_pairs: flagged.slice(0, MAX_FLAGGED_PAIRS_TO_SURFACE),
    summary,
    notes,
  };
}

export function counterfactualAuditNotRun(
  reason: string,
  notes: string[] = [],
  pairsNotApplicable = 0,
  fieldsNotApplicable: CounterfactualField[] = [],
): CounterfactualAudit {
  return {
    status: "not_run",
    pairs_tested: 0,
    pairs_not_applicable: pairsNotApplicable,
    fields_tested: [],
    fields_not_applicable: fieldsNotApplicable,
    max_abs_buy_likelihood_delta: 0,
    max_abs_market_fit_delta: 0,
    flagged_pairs: [],
    summary: reason,
    notes,
  };
}

function buildValuePools(personas: Persona[]): Record<CounterfactualField, string[]> {
  const pools: Record<CounterfactualField, Set<string>> = {
    region: new Set(),
    income_band: new Set(),
    occupation: new Set(),
    life_stage: new Set(),
    "decision_context.budget_control": new Set(),
  };

  for (const p of personas) {
    for (const field of AUDIT_FIELDS) {
      const value = getFieldValue(p, field);
      if (value) pools[field].add(value);
    }
  }

  return Object.fromEntries(
    Object.entries(pools).map(([field, values]) => [field, Array.from(values)]),
  ) as Record<CounterfactualField, string[]>;
}

function getFieldValue(persona: Persona, field: CounterfactualField): string | null {
  switch (field) {
    case "region":
      return persona.region || null;
    case "income_band":
      return persona.income_band || null;
    case "occupation":
      return persona.occupation || null;
    case "life_stage":
      return persona.life_stage || null;
    case "decision_context.budget_control":
      return persona.decision_context.budget_control || null;
  }
}

function setFieldValue(persona: Persona, field: CounterfactualField, value: string): Persona {
  const copy: Persona = {
    ...persona,
    decision_context: { ...persona.decision_context },
    dealbreakers: [...persona.dealbreakers],
  };

  switch (field) {
    case "region":
      copy.region = value;
      break;
    case "income_band":
      copy.income_band = value;
      break;
    case "occupation":
      copy.occupation = value;
      break;
    case "life_stage":
      copy.life_stage = value;
      break;
    case "decision_context.budget_control":
      copy.decision_context.budget_control = value;
      break;
  }

  return copy;
}

function chooseAlternative(
  baseline: string | null,
  pool: string[],
  fallback: string[],
): string | null {
  const seen = new Set<string>();
  const candidates = [...pool, ...fallback].filter((v) => {
    const normalized = v.trim();
    if (!normalized || normalized === baseline || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  return candidates[0] ?? null;
}

function fallbackFor(field: CounterfactualField): string[] {
  switch (field) {
    case "region":
      return REGION_FALLBACKS;
    case "income_band":
      return INCOME_FALLBACKS;
    case "occupation":
      return OCCUPATION_FALLBACKS;
    case "life_stage":
      return LIFE_STAGE_FALLBACKS;
    case "decision_context.budget_control":
      return BUDGET_CONTROL_FALLBACKS;
  }
}

function deterministicSpread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items.slice();
  if (count <= 1) return [items[0]];

  const out: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.floor((i * (items.length - 1)) / (count - 1));
    out.push(items[idx]);
  }
  return out;
}
