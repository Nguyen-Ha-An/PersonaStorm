/**
 * Aggregator — builds the final StormReport. Port of
 * apps/api/app/services/aggregation/report_builder.py. Template-based synthesis
 * over real aggregates; numbers are computed here, never invented by an LLM.
 */

import { mostCommon, normalizeObjection, round } from "../text";
import { anchorSet, type StimulusFeatures } from "../stimulusParser";
import type { Persona, PersonaReaction } from "../types";
import {
  DISCLAIMER,
  type AdoptionSummary,
  type KillQuoteContext,
  type Level,
  type NextValidation,
  type Overall,
  type QualityMetrics,
  type Recommendation,
  type SegmentReport,
  type StormReport,
} from "../report";
import { buildAgeCohorts } from "./ageAnalysis";
import { buildCriteriaBreakdown, diagnoseWeakness } from "./criteriaAggregation";
import { clusterObjections } from "./objections";
import { averageWtp, buildPriceCurve } from "./pricingCurve";

export interface ReportRequest {
  title: string;
  stimulus_type: string;
  target_market: string;
}

const TEST_LABELS: Record<string, string> = {
  survey: "a targeted survey",
  interview: "user interviews",
  landing_page_ab_test: "a landing-page A/B test",
  pricing_test: "a pricing (Van Westendorp) test",
  ad_test: "an ad test",
  usability_test: "a usability test",
};

const LEVEL_RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 };
const RANK_LEVEL: Record<number, Level> = { 0: "low", 1: "medium", 2: "high" };

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function buildReport(
  stormId: string,
  request: ReportRequest,
  personas: Persona[],
  reactions: PersonaReaction[],
  features: StimulusFeatures,
  quality: QualityMetrics,
  category = "generic",
): StormReport {
  const n = Math.max(1, reactions.length);
  const avgBuy = reactions.reduce((s, r) => s + r.buy_likelihood, 0) / n;
  const avgFit = reactions.reduce((s, r) => s + r.market_fit_score, 0) / n;
  const adoption: AdoptionSummary = {
    green: reactions.filter((r) => r.status === "green").length,
    yellow: reactions.filter((r) => r.status === "yellow").length,
    red: reactions.filter((r) => r.status === "red").length,
    average_buy_likelihood: round(avgBuy, 4),
    average_market_fit_score: round(avgFit, 4),
  };

  const segments = segmentReports(reactions);
  const objections = clusterObjections(reactions);
  const curve = buildPriceCurve(reactions, features);
  const avgWtp = averageWtp(reactions);
  const [killQuote, killCtx] = killQuoteOf(personas, reactions, features);

  const criteriaBreakdown = buildCriteriaBreakdown(reactions, category);
  const { weakest, strongest, topBlockers, topStrengths } = diagnoseWeakness(criteriaBreakdown);
  const ageCohorts = buildAgeCohorts(reactions);
  const overall: Overall = {
    market_fit_score: round(avgFit, 4),
    confidence: confidenceOf(quality),
    top_blockers: topBlockers,
    top_strengths: topStrengths,
  };
  const nextValidation = nextHumanValidation(reactions);
  const recommendations = recommendationsOf(features, quality, objections, segments, curve);
  const summary = summaryOf(request, adoption, objections, avgWtp, quality, topBlockers, reactions.length);

  return {
    storm_id: stormId,
    title: request.title,
    summary,
    product_category: category,
    adoption,
    overall,
    segments,
    criteria_breakdown: criteriaBreakdown,
    weakest_criteria: weakest,
    strongest_criteria: strongest,
    age_cohorts: ageCohorts,
    top_objections: objections,
    price_sensitivity: curve,
    kill_quote: killQuote,
    kill_quote_context: killCtx,
    quality,
    recommendations,
    next_human_validation: nextValidation,
    persona_count: reactions.length,
    stimulus_type: request.stimulus_type,
    target_market: request.target_market,
    avg_max_price: avgWtp,
    generated_at: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };
}

function confidenceOf(quality: QualityMetrics): Level {
  const ceiling = LEVEL_RANK[quality.benchmark_confidence];
  let rank = ceiling;
  if (quality.collapse_risk === "high") rank -= 2;
  else if (quality.collapse_risk === "medium") rank -= 1;
  rank = Math.max(0, Math.min(rank, ceiling));
  return RANK_LEVEL[rank];
}

function nextHumanValidation(reactions: PersonaReaction[]): NextValidation[] {
  const byTest = new Map<string, string[]>();
  for (const r of reactions) {
    const rec = r.research_recommendation;
    if (!rec.should_validate_with_humans) continue;
    if (!byTest.has(rec.best_next_test)) byTest.set(rec.best_next_test, []);
    const q = rec.validation_question.trim();
    if (q) byTest.get(rec.best_next_test)!.push(q);
  }
  if (byTest.size === 0) return [];

  let total = 0;
  for (const qs of byTest.values()) total += qs.length || 1;
  const ordered = Array.from(byTest.entries()).sort((a, b) => b[1].length - a[1].length);
  const out: NextValidation[] = [];
  for (const [test, questions] of ordered.slice(0, 3)) {
    let question = "";
    if (questions.length > 0) {
      const counts = new Map<string, number>();
      for (const q of questions) counts.set(q, (counts.get(q) ?? 0) + 1);
      question = mostCommon(counts, 1)[0][0];
    }
    const share = total ? questions.length / total : 0.0;
    const label = TEST_LABELS[test] ?? test.replace(/_/g, " ");
    out.push({
      question: question || `Run ${label} to validate the swarm's read.`,
      test_type: test,
      rationale: `${pct(share)} of personas flagged this as the highest-value human test — run ${label} next.`,
    });
  }
  return out;
}

function topObjection(rs: PersonaReaction[]): string {
  const counts = new Map<string, number>();
  const raw = new Map<string, string>();
  for (const r of rs) {
    if (r.first_objection.trim()) {
      const key = normalizeObjection(r.first_objection);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!raw.has(key)) raw.set(key, r.first_objection);
    }
  }
  if (counts.size === 0) return "none recorded";
  return raw.get(mostCommon(counts, 1)[0][0])!;
}

function segmentReports(reactions: PersonaReaction[]): SegmentReport[] {
  const bySeg = new Map<string, PersonaReaction[]>();
  for (const r of reactions) {
    const seg = r.segment || "unknown";
    if (!bySeg.has(seg)) bySeg.set(seg, []);
    bySeg.get(seg)!.push(r);
  }
  const ordered = Array.from(bySeg.entries()).sort((a, b) => b[1].length - a[1].length);

  const out: SegmentReport[] = [];
  for (const [seg, rs] of ordered) {
    const n = rs.length;
    const green = rs.filter((r) => r.status === "green").length;
    const yellow = rs.filter((r) => r.status === "yellow").length;
    const red = rs.filter((r) => r.status === "red").length;
    const topObj = topObjection(rs);
    const adoptionRate = green / n;
    const avgLike = rs.reduce((s, r) => s + r.buy_likelihood, 0) / n;
    const avgPrice = rs.reduce((s, r) => s + r.max_price, 0) / n;

    let insight: string;
    if (adoptionRate >= 0.5) {
      insight = `Strongest segment (${pct(adoptionRate)} likely buyers) — lead go-to-market here; residual concern: ${topObj}.`;
    } else if (red / n >= 0.5) {
      insight = `High-risk segment (${pct(red / n)} rejectors) — dominant blocker: ${topObj}. Fix or deprioritize.`;
    } else {
      insight = `Persuadable middle (${pct(yellow / n)} undecided) — converting them hinges on: ${topObj}.`;
    }

    out.push({
      segment: seg,
      personas: n,
      green,
      yellow,
      red,
      adoption_rate: round(adoptionRate, 3),
      avg_buy_likelihood: round(avgLike, 3),
      avg_max_price: round(avgPrice, 2),
      top_objection: topObj,
      insight,
    });
  }
  return out;
}

function killQuoteOf(
  personas: Persona[],
  reactions: PersonaReaction[],
  features: StimulusFeatures,
): [string, KillQuoteContext | null] {
  const byId = new Map(personas.map((p) => [p.persona_id, p]));
  const anchors = anchorSet(features);
  let bestScore = -1.0;
  let best: [PersonaReaction, Persona] | null = null;
  for (const r of reactions) {
    if (r.status !== "red") continue;
    const p = byId.get(r.persona_id);
    if (!p) continue;
    const ql = r.quote.toLowerCase();
    const specificity = Array.from(anchors).some((a) => ql.includes(a)) ? 1.0 : 0.4;
    const lengthBonus = Math.min(1.0, r.quote.length / 120.0);
    const score = (1.0 - r.buy_likelihood) * 0.4 + p.skepticism * 0.3 + specificity * 0.2 + lengthBonus * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = [r, p];
    }
  }
  if (best === null) return ["No rejection strong enough to produce a kill quote.", null];
  const [r, p] = best;
  return [r.quote, { persona_id: p.persona_id, segment: p.segment, buy_likelihood: r.buy_likelihood, skepticism: p.skepticism }];
}

function recommendationsOf(
  features: StimulusFeatures,
  quality: QualityMetrics,
  objections: ReturnType<typeof clusterObjections>,
  segments: SegmentReport[],
  curve: ReturnType<typeof buildPriceCurve>,
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (objections.length > 0) {
    const top = objections[0];
    if (top.share >= 0.12) {
      recs.push({
        title: `Neutralize the #1 objection: “${top.label}”`,
        detail: `${pct(top.share)} of the swarm raised this (hits ${top.top_segments.join(", ") || "multiple segments"} hardest). Address it directly in the first screen of copy.`,
        priority: "now",
      });
    }
  }
  if (!features.hasPricing) {
    recs.push({
      title: "Publish visible pricing",
      detail: "No price was detected in the stimulus. Hidden pricing is a top synthetic objection and typically the cheapest fix before real-user testing.",
      priority: "now",
    });
  }
  if (!features.hasProof) {
    recs.push({
      title: "Add one concrete proof point",
      detail: "The stimulus contains claims but no numbers, case study, or testimonial. High-skepticism personas defaulted to rejection because of it.",
      priority: "now",
    });
  }
  const fairCandidates = curve.filter((pt) => pt.share_willing >= 0.5);
  const fair = fairCandidates.length > 0 ? fairCandidates.reduce((a, b) => (b.price > a.price ? b : a)) : null;
  if (fair) {
    recs.push({
      title: `Price-test around $${fmtG(fair.price)}`,
      detail: `${pct(fair.share_willing)} of the swarm accepts $${fmtG(fair.price)}. Use it as the midpoint of a Van Westendorp test with real users.`,
      priority: "next",
    });
  }
  const weakest = segments.length > 0 ? segments.reduce((a, b) => (b.adoption_rate < a.adoption_rate ? b : a)) : null;
  if (weakest && weakest.adoption_rate < 0.25 && segments.length > 1) {
    recs.push({
      title: `Re-message or deprioritize: ${weakest.segment}`,
      detail: `Only ${pct(weakest.adoption_rate)} adoption; blocker: ${weakest.top_objection}.`,
      priority: "next",
    });
  }
  if (quality.collapse_risk !== "low") {
    recs.push({
      title: "Treat this run as directional only",
      detail: `Collapse risk is ${quality.collapse_risk} — reaction diversity is below target. Re-run with higher persona diversity before acting on numbers.`,
      priority: "now",
    });
  }
  recs.push({
    title: "Validate top objections with real humans",
    detail: `Wind-tunnel results are hypotheses. A 20-30 person survey targeting the top ${Math.min(3, objections.length)} objections above will confirm or kill them for a fraction of a failed-launch cost.`,
    priority: "next",
  });
  return recs.slice(0, 6);
}

function summaryOf(
  request: ReportRequest,
  adoption: AdoptionSummary,
  objections: ReturnType<typeof clusterObjections>,
  avgWtp: number,
  quality: QualityMetrics,
  topBlockers: string[],
  total: number,
): string {
  const t = Math.max(1, total);
  const { green: g, yellow: y, red: r } = adoption;
  const topLine = `${pct(g / t)} of ${t} synthetic personas showed buy intent, ${pct(y / t)} are persuadable but unconvinced, and ${pct(r / t)} rejected the ${request.stimulus_type.replace(/_/g, " ")}.`;
  let diagLine = "";
  if (topBlockers.length > 0) {
    diagLine = ` The weakest purchase criteria are ${topBlockers.slice(0, 3).join(", ")} — these, more than price, gate adoption.`;
  }
  let objLine = "";
  if (objections.length > 0) {
    objLine = ` The dominant free-text objection — “${objections[0].label}” — accounts for ${pct(objections[0].share)} of first objections.`;
  }
  const wtpLine = ` Average stated willingness to pay is $${fmtG(avgWtp)}.`;
  const trustLine = ` Signal quality: collapse risk ${quality.collapse_risk}, segment variance ${quality.segment_variance}, benchmark confidence ${quality.benchmark_confidence} — treat as pre-research hypotheses, not validated demand.`;
  return topLine + diagLine + objLine + wtpLine + trustLine;
}

/** Python's :g float formatting: trim trailing zeros. */
function fmtG(v: number): string {
  return String(Number(v));
}
