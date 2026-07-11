/**
 * Assumptions registry (spec §6): every directional modifier in the engine
 * must be registered here with an evidence status, or be deleted. A per-run
 * AssumptionLedger counts how often each fired so the report can surface it.
 * Firing an UNREGISTERED id throws in dev/test and logs+skips in production.
 */

export type EvidenceStatus = "sourced" | "derived" | "unverified";

export interface AssumptionDef {
  id: string;
  description: string;
  evidence_status: EvidenceStatus;
  /** Max fraction of a sub-segment this assumption may be applied to (enforced by callers). */
  max_rate?: number;
}

export interface FiredAssumption {
  id: string;
  evidence_status: EvidenceStatus;
  personas_affected: number;
}

export const ASSUMPTION_DEFS: Record<string, AssumptionDef> = {
  pricing_dealbreaker_injection: {
    id: "pricing_dealbreaker_injection",
    description: "Personas with price_sensitivity > 0.72 get a pricing dealbreaker injected (rate-bounded).",
    evidence_status: "unverified",
    max_rate: 0.4,
  },
  privacy_dealbreaker_injection: {
    id: "privacy_dealbreaker_injection",
    description: "Personas with privacy_sensitivity > 0.75 get a privacy dealbreaker appended.",
    evidence_status: "unverified",
  },
  ai_skeptic_trust_penalty: {
    id: "ai_skeptic_trust_penalty",
    description: "AI mention without proof lowers trust (-0.06) for personas with skepticism > 0.6.",
    evidence_status: "derived",
  },
  ai_novelty_activation_boost: {
    id: "ai_novelty_activation_boost",
    description: "AI mention raises activation for personas with novelty_seeking > 0.55.",
    evidence_status: "derived",
  },
  // Documentation entries for the bounded modifiers inside computeMarketFit
  // (scoring.ts). They already self-report via market_fit_breakdown.modifier_reasons;
  // registering gives them an evidence status the report can cite.
  trust_gap_high_proof_modifier: {
    id: "trust_gap_high_proof_modifier",
    description: "scoring.ts: trust < 0.3 with proof_requirement > 0.75 → -0.05.",
    evidence_status: "derived",
  },
  strong_urgent_need_modifier: {
    id: "strong_urgent_need_modifier",
    description: "scoring.ts: need, fit and urgency all high → +0.04.",
    evidence_status: "derived",
  },
  semantic_blend_weight: {
    id: "semantic_blend_weight",
    description: "Grounded criteria = 0.7·semantic + 0.3·formula when a semantic matrix is present.",
    evidence_status: "derived",
  },
};

export class AssumptionLedger {
  private counts = new Map<string, number>();

  fire(id: string): void {
    if (!ASSUMPTION_DEFS[id]) {
      const msg = `[assumptions] fired unregistered assumption '${id}' — register it in ASSUMPTION_DEFS or delete the nudge`;
      if (process.env.NODE_ENV === "production") {
        console.error(msg);
        return;
      }
      throw new Error(msg);
    }
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
  }

  fired(): FiredAssumption[] {
    return Array.from(this.counts.entries()).map(([id, n]) => ({
      id,
      evidence_status: ASSUMPTION_DEFS[id].evidence_status,
      personas_affected: n,
    }));
  }
}
