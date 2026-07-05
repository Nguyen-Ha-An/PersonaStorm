/**
 * Internal-consistency checker — port of
 * apps/api/app/services/quality/consistency_checker.py.
 */

import { stddev } from "../text";
import type { Persona, PersonaReaction } from "../types";

const TRUST_LOW = 0.25;
const BUY_HIGH = 0.75;
const PRICING_LOW = 0.25;
const WTP_BUDGET_SHARE = 0.4;
const PROOF_HIGH = 0.7;
const TRUST_HIGH = 0.7;
const UNIFORM_STDDEV = 0.05;

export function checkConsistency(persona: Persona, reaction: PersonaReaction): string[] {
  const scores = reaction.criteria_scores;
  const trust = scores.trust;
  const pricingAcceptance = scores.pricing_acceptance;
  const proofRequirement = scores.proof_requirement;

  const violations: string[] = [];

  if (trust < TRUST_LOW && reaction.buy_likelihood > BUY_HIGH) violations.push("trust_vs_buy");
  if (pricingAcceptance < PRICING_LOW && reaction.max_price > WTP_BUDGET_SHARE * persona.monthly_budget_usd) {
    violations.push("price_vs_wtp");
  }
  if (proofRequirement > PROOF_HIGH && trust > TRUST_HIGH) violations.push("proof_vs_trust");
  if (stddev(Object.values(scores)) < UNIFORM_STDDEV) violations.push("uniform_criteria");

  return violations;
}

export function criteriaConsistencyScore(personas: Persona[], reactions: PersonaReaction[]): number {
  const byId = new Map(personas.map((p) => [p.persona_id, p]));
  const paired = reactions.filter((r) => byId.has(r.persona_id)).map((r) => [byId.get(r.persona_id)!, r] as const);
  if (paired.length === 0) return 1.0;
  const consistent = paired.filter(([p, r]) => checkConsistency(p, r).length === 0).length;
  return consistent / paired.length;
}
