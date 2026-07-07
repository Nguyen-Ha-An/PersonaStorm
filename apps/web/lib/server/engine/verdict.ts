/**
 * Verdict engine — derives a headline verdict and up to three enriched,
 * anchor-linked actions from the fields a StormReport ALREADY contains.
 *
 * Pure, isomorphic (safe on the server at build time AND on the client as a
 * fallback), and TOTAL: every field is read defensively so a sparse, partial,
 * or legacy report yields a verdict instead of throwing. It never re-infers or
 * changes an engine number — it reuses GREEN_THRESHOLD / RED_THRESHOLD verbatim.
 */

import { GREEN_THRESHOLD, RED_THRESHOLD } from "./types";
import type { Verdict, TopAction, TopActionEvidence } from "./types";
import type { StormReport, Recommendation } from "./report";

/**
 * Permissive input for the total derivation functions: a full `StormReport` is
 * structurally assignable to it, but every field is optional so sparse,
 * partial, or legacy reports are accepted without throwing.
 */
export type DerivableReport = Partial<StormReport>;

const HEADLINES: Record<Verdict["level"], string> = {
  strong: "Strong signal - worth building",
  conditional: "Promising - fix these first",
  weak: "Weak signal - not yet",
};

const pct = (value: number): string => `${Math.round(value * 100)}%`;

const asArray = <T>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);

export function deriveVerdict(report: DerivableReport): Verdict {
  const overall = report.overall ?? null;

  const rawScore = Number(overall?.market_fit_score);
  const marketFit = Number.isFinite(rawScore) ? rawScore : 0;

  const confidence = overall?.confidence ?? "low";

  const collapse = report.quality?.collapse_risk;
  const collapseIsHigh = collapse === "high";
  const collapseNonLow = collapse !== "low"; // undefined -> treated as non-low

  const caveated = confidence === "low" || collapseNonLow;

  const green = Number(report.adoption?.green) || 0;
  const yellow = Number(report.adoption?.yellow) || 0;
  const red = Number(report.adoption?.red) || 0;
  const total = green + yellow + red;
  const intentShare = total > 0 ? green / total : 0;

  let level: Verdict["level"];
  if (marketFit >= GREEN_THRESHOLD && !caveated) level = "strong";
  else if (marketFit < RED_THRESHOLD || collapseIsHigh) level = "weak";
  else level = "conditional";

  const head = `${pct(marketFit)} market fit, ${confidence} confidence`;
  const strength = overall?.top_strengths?.[0];
  const blocker = overall?.top_blockers?.[0];
  const objection = report.top_objections?.[0]?.label;

  const bits: string[] = [];
  if (blocker) bits.push(blocker);
  if (objection) bits.push(`'${objection}'`);

  let rationale: string;
  if (bits.length > 0) {
    const joined = bits.join(" and ");
    const verb = bits.length > 1 ? "are" : "is";
    const lead = strength ? ` — ${strength}, but ` : "; ";
    rationale = `${head}${lead}${joined} ${verb} holding intent at ${pct(intentShare)}.`;
  } else if (strength) {
    rationale = `${head} — ${strength}; intent at ${pct(intentShare)}.`;
  } else {
    rationale = `${head}; intent at ${pct(intentShare)}.`;
  }

  return { level, headline: HEADLINES[level], rationale, caveated };
}

// R6: lowest price at which willingness first drops below half; else avg_max_price.
function pricingStat(report: DerivableReport): string {
  const curve = asArray(report.price_sensitivity)
    .slice()
    .sort((a, b) => a.price - b.price);
  const crossover = curve.find((point) => Number(point.share_willing) < 0.5);
  const price = crossover ? crossover.price : report.avg_max_price;
  return typeof price === "number" ? `~$${Math.round(price)}` : "-";
}

interface KeywordRule {
  keywords: string[];
  anchorId: string;
  evidence: (report: DerivableReport) => TopActionEvidence | undefined;
}

// First rule whose keyword appears (case-insensitive) in title-then-detail wins.
const KEYWORD_RULES: KeywordRule[] = [
  {
    keywords: ["objection"],
    anchorId: "#objections",
    evidence: (report) => {
      const objection = report.top_objections?.[0];
      return objection ? { stat: pct(objection.share), quote: objection.example_quote } : undefined;
    },
  },
  {
    keywords: ["pricing", "price"],
    anchorId: "#pricing",
    evidence: (report) => ({ stat: pricingStat(report) }),
  },
  {
    keywords: ["proof", "trust"],
    anchorId: "#trust",
    evidence: (report) => ({ stat: `${Number(report.adoption?.yellow) || 0}` }),
  },
  {
    keywords: ["segment"],
    anchorId: "#segments",
    evidence: (report) => {
      const segment = report.segments?.[0];
      return segment ? { stat: `${segment.segment}: ${pct(segment.adoption_rate)}` } : undefined;
    },
  },
  {
    keywords: ["collapse", "quality", "consensus"],
    anchorId: "#quality",
    evidence: (report) => ({ stat: `collapse risk: ${report.quality?.collapse_risk ?? "unknown"}` }),
  },
];

function enrich(rec: Recommendation, report: DerivableReport, rank: number): TopAction {
  const base = { rank, imperative: rec.title, why: rec.detail };
  const haystack = `${rec.title} ${rec.detail}`.toLowerCase();
  const rule = KEYWORD_RULES.find((candidate) =>
    candidate.keywords.some((keyword) => haystack.includes(keyword)),
  );
  if (!rule) return { ...base, anchorId: "#full-diagnostics" }; // DEFAULT — no evidence
  const evidence = rule.evidence(report);
  return evidence ? { ...base, anchorId: rule.anchorId, evidence } : { ...base, anchorId: rule.anchorId };
}

// R8: a great result (no blockers, nothing urgent) still ends on concrete steps.
function validationActions(report: DerivableReport): TopAction[] {
  return asArray(report.next_human_validation)
    .slice(0, 3)
    .map((item, index) => ({
      rank: index + 1,
      imperative: "Validate before shipping",
      why: item.question,
      evidence: { stat: item.test_type },
      anchorId: "#next-validation",
    }));
}

export function selectTopActions(report: DerivableReport): TopAction[] {
  const recommendations = asArray(report.recommendations);
  const blockers = asArray(report.overall?.top_blockers);
  const hasUrgent = recommendations.some((rec) => rec.priority === "now");

  if (blockers.length === 0 && !hasUrgent) {
    return validationActions(report);
  }

  const actions: TopAction[] = recommendations
    .slice(0, 3)
    .map((rec, index) => enrich(rec, report, index + 1));
  const seen = new Set(actions.map((action) => action.imperative));

  for (const criterion of asArray(report.weakest_criteria)) {
    if (actions.length >= 3) break;
    const imperative = `Strengthen ${criterion.label}`;
    if (seen.has(imperative)) continue;
    actions.push({
      rank: actions.length + 1,
      imperative,
      why: "One of the lowest-scoring criteria.",
      evidence: { stat: pct(criterion.average_score) },
      anchorId: "#criteria",
    });
    seen.add(imperative);
  }
  for (const validation of asArray(report.next_human_validation)) {
    if (actions.length >= 3) break;
    const imperative = "Validate before shipping";
    if (seen.has(imperative)) continue;
    actions.push({
      rank: actions.length + 1,
      imperative,
      why: validation.question,
      evidence: { stat: validation.test_type },
      anchorId: "#next-validation",
    });
    seen.add(imperative);
  }

  return actions.slice(0, 3).map((action, index) => ({ ...action, rank: index + 1 }));
}

/**
 * Build-time helper: attach the derived verdict + top actions so they are
 * persisted in the stored report JSON (and the client fallback yields the same
 * shapes when they are absent on a legacy run).
 */
export function attachVerdictAndActions<T extends DerivableReport>(
  report: T,
): T & { verdict: Verdict; top_actions: TopAction[] } {
  return { ...report, verdict: deriveVerdict(report), top_actions: selectTopActions(report) };
}
