/**
 * Semantic grounding types + sanitizer (spec §7). The assessor LLM proposes
 * per-segment scores for the 5 grounded criteria; sanitizeSemantic is the trust
 * boundary — every score is clamped to [0,1] or DROPPED (so the blend falls back
 * to the formula for that field). No raw LLM number ever reaches the scorer.
 */
export const GROUNDED_CRITERIA = [
  "solution_fit", "need_intensity", "differentiation", "workflow_fit", "problem_awareness",
] as const;

export type GroundedCriterion = (typeof GROUNDED_CRITERIA)[number];

export interface SegmentAssessment {
  scores: Record<string, number>;
  rationales: Record<string, string>;
}

export type SemanticSource = "nvidia" | "fireworks" | "fallback_formulas";

export interface SemanticMatrix {
  segments: Record<string, SegmentAssessment>;
  real_alternatives_considered: string[];
  source: SemanticSource;
}

const GROUNDED = new Set<string>(GROUNDED_CRITERIA);

export function sanitizeSemantic(raw: unknown, segmentNames: string[]): SemanticMatrix | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const segsIn = obj.segments;
  if (!segsIn || typeof segsIn !== "object") return null;

  const expected = new Set(segmentNames);
  const segments: Record<string, SegmentAssessment> = {};
  for (const [name, val] of Object.entries(segsIn as Record<string, unknown>)) {
    if (!expected.has(name) || !val || typeof val !== "object") continue;
    const scores: Record<string, number> = {};
    const rationales: Record<string, string> = {};
    for (const [cid, cell] of Object.entries(val as Record<string, unknown>)) {
      if (!GROUNDED.has(cid) || !cell || typeof cell !== "object") continue;
      const c = cell as { score?: unknown; rationale?: unknown };
      const s = typeof c.score === "number" ? c.score : NaN;
      if (Number.isFinite(s) && s >= 0 && s <= 1) {
        scores[cid] = s;
        if (typeof c.rationale === "string") rationales[cid] = c.rationale.slice(0, 300);
      }
    }
    segments[name] = { scores, rationales };
  }

  const alts = Array.isArray(obj.real_alternatives_considered)
    ? (obj.real_alternatives_considered as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 12)
    : [];

  return { segments, real_alternatives_considered: alts, source: "fallback_formulas" };
}
