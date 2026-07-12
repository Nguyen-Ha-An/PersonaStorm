import "./only";

/**
 * Storm engine orchestrator — the Vercel analogue of
 * apps/api/app/services/storm_runner.py's pipeline, but SYNCHRONOUS.
 *
 * Serverless functions can't hold in-memory storm state or run background
 * tasks across invocations, so a run is executed end-to-end in one call at
 * create time:
 *   parse -> classify -> build personas -> diversity -> swarm reactions
 *   -> quality metrics -> report -> analyst re-narration
 *
 * It returns the final report PLUS the ordered reaction events + progress
 * snapshot, which are persisted so the SSE stream can replay a completed run
 * as a live-looking storm (see app/api/storm/[id]/stream/route.ts).
 */

import { getConfig, type ServerConfig } from "./env";
import { getAnalyst } from "./engine/analyst";
import { classifyCategory } from "./engine/criteria/classifier";
import { AssumptionLedger, type FiredAssumption } from "./engine/criteria/assumptions";
import { PersonaGenerator } from "./engine/persona/generator";
import type { PriorsMeta } from "./engine/persona/priorsLoader";
import { getProvider } from "./engine/providers";
import { getSemanticAssessor } from "./engine/semantic/assessor";
import type { SegmentBrief } from "./engine/semantic/prompt";
import type { SemanticMatrix } from "./engine/semantic/types";
import { buildReport, type ReportRequest } from "./engine/aggregation/reportBuilder";
import {
  buildCounterfactualPairs,
  counterfactualAuditNotRun,
  summarizeCounterfactualAudit,
  type CounterfactualAudit,
} from "./engine/quality/biasAudit";
import { attachVerdictAndActions } from "./engine/verdict";
import { computeQuality } from "./engine/quality/metrics";
import { parseStimulus } from "./engine/stimulusParser";
import { mostCommon, normalizeObjection, round } from "./engine/text";
import type { PersonaReaction } from "./engine/types";
import type { CalibrationEvidence, StormReport } from "./engine/report";

const MAX_CONCURRENCY = 8;

export interface StormInput {
  stormId: string;
  title: string;
  stimulus: string;
  stimulusType: string;
  targetMarket: string;
  customSegmentDescription?: string | null;
  productCategory?: string | null;
  personaCount: number;
  seed?: number | null;
  /**
   * Test/backtest-only escape hatch: when present, skips the live semantic
   * assessor call entirely and uses this matrix instead (spec §9 backtest
   * gate — recorded fixtures replay the full blend path offline, with NO
   * live LLM call in CI regardless of which assessor recorded them).
   */
  semanticOverride?: SemanticMatrix;
}

/** Flat SSE reaction payload (matches apps/web/lib/types.ts ReactionEvent). */
export interface ReactionEvent {
  persona_id: string;
  index: number;
  segment: string;
  buy_likelihood: number;
  max_price: number;
  status: "green" | "yellow" | "red";
  first_objection: string;
  quote: string;
}

/** Progress snapshot (matches apps/web/lib/types.ts ProgressEvent). */
export interface ProgressEvent {
  status: string;
  completed: number;
  total: number;
  green: number;
  yellow: number;
  red: number;
  avg_max_price: number;
  avg_market_fit: number;
  top_objection: string;
  collapse_risk: "low" | "medium" | "high";
  elapsed_ms: number;
}

export interface StormResult {
  report: StormReport;
  reactions: ReactionEvent[];
  progress: ProgressEvent;
}

export async function runStorm(input: StormInput, cfg: ServerConfig = getConfig()): Promise<StormResult> {
  const started = Date.now();
  const seed = input.seed ?? cfg.personaSeed;

  // 1) parse + authoritative category (explicit override wins).
  const features = parseStimulus(input.stimulus, input.title, input.stimulusType);
  const category = input.productCategory || classifyCategory(features)[0];

  // 2) personas + diversity validation (ledger records generator assumptions).
  const ledger = new AssumptionLedger();
  const generator = new PersonaGenerator(seed, ledger);
  const { personas, priorsMeta } = generator.generate(input.targetMarket, input.personaCount, input.customSegmentDescription);

  // 2b) semantic grounding: one assessment per storm, cached and fed to every reaction.
  const segNames = Array.from(new Set(personas.map((p) => p.segment)));
  const briefs: SegmentBrief[] = segNames.map((name) => {
    const sample = personas.find((p) => p.segment === name)!;
    return { name, occupations: [sample.occupation], income_bands: [sample.income_band], sub_segment_hint: sample.sub_segment };
  });
  const semantic = input.semanticOverride ?? (await getSemanticAssessor(cfg).assess(input.stimulus, category, briefs));

  // 3) swarm reactions.
  const provider = getProvider(cfg, ledger);
  const reactions: PersonaReaction[] = await provider.reactBatch(
    personas,
    input.stimulus,
    input.stimulusType,
    features,
    MAX_CONCURRENCY,
    category,
    semantic,
  );

  // Snapshot fired assumptions for the POPULATION only, before the
  // counterfactual audit below re-runs personas through the same `provider`
  // (and therefore the same shared `ledger`). Those audit probes re-fire AI
  // nudges (ai_skeptic_trust_penalty, ai_novelty_activation_boost) — counting
  // them here would inflate personas_affected in calibration_evidence and
  // diverge from the Python engine's population-only semantics.
  const populationAssumptions = ledger.fired();

  // 3b) counterfactual bias audit — cheap deterministic re-runs on the mock
  // provider; skipped (labeled) for live-LLM providers where each pair would
  // cost real API calls.
  let audit: CounterfactualAudit;
  if (provider.name === "mock") {
    const { pairs, notes } = buildCounterfactualPairs(personas, 16, provider.name);
    const cfReactions: PersonaReaction[] = [];
    for (const pair of pairs) {
      cfReactions.push(await provider.react(pair.counterfactual_persona, input.stimulus, input.stimulusType, features, category));
    }
    audit = summarizeCounterfactualAudit(pairs, reactions, cfReactions, notes);
  } else {
    audit = counterfactualAuditNotRun(
      `Counterfactual audit skipped for provider '${provider.name}' — counterfactual re-runs would cost live LLM calls.`,
    );
  }

  // 4) quality metrics.
  const quality = computeQuality(personas, reactions, features);
  // Nothing silent: a live provider may drop a bounded fraction of personas
  // after retries (fireworksProvider drop tolerance) — label it.
  if (reactions.length < personas.length) {
    const dropped = personas.length - reactions.length;
    quality.notes.push(
      `${dropped} of ${personas.length} personas failed after retries (live-provider transient errors) and were dropped — the report reflects the ${reactions.length} that completed.`,
    );
  }

  // 5) report + analyst re-narration (best-effort, never throws).
  const request: ReportRequest = {
    title: input.title,
    stimulus_type: input.stimulusType,
    target_market: input.targetMarket,
  };
  let report = buildReport(input.stormId, request, personas, reactions, features, quality, category);
  try {
    report = await getAnalyst(cfg).enhanceReport(report);
  } catch (err) {
    console.warn("[personastorm engine] analyst enhance failed, keeping deterministic report:", (err as Error).message);
  }

  // Derive the verdict + top actions from the FINAL report (post-analyst) so they
  // reflect the narrated recommendations, and persist them on the report JSON.
  report = attachVerdictAndActions(report);

  // 5b) calibration evidence — parameters' provenance, fired assumptions,
  // counterfactual audit. Attached post-analyst like the verdict so the
  // analyst can never rewrite it.
  report.calibration_evidence = buildCalibrationEvidence(priorsMeta, populationAssumptions, audit, semantic.source);

  // 6) stream events + final progress snapshot.
  const reactionEvents: ReactionEvent[] = reactions.map((r, i) => ({
    persona_id: r.persona_id,
    index: i,
    segment: r.segment,
    buy_likelihood: r.buy_likelihood,
    max_price: r.max_price,
    status: r.status,
    first_objection: r.first_objection,
    quote: r.quote,
  }));

  const total = reactions.length;
  const green = reactions.filter((r) => r.status === "green").length;
  const yellow = reactions.filter((r) => r.status === "yellow").length;
  const red = reactions.filter((r) => r.status === "red").length;
  const avgMaxPrice = total ? round(reactions.reduce((s, r) => s + r.max_price, 0) / total, 2) : 0.0;
  const avgMarketFit = total ? round(reactions.reduce((s, r) => s + r.market_fit_score, 0) / total, 3) : 0.0;

  const progress: ProgressEvent = {
    status: "complete",
    completed: total,
    total,
    green,
    yellow,
    red,
    avg_max_price: avgMaxPrice,
    avg_market_fit: avgMarketFit,
    top_objection: topObjectionOf(reactions),
    collapse_risk: quality.collapse_risk,
    elapsed_ms: Date.now() - started,
  };

  return { report, reactions: reactionEvents, progress };
}

/** Assembles the report's calibration_evidence block (spec §10). Exported for direct testing. */
export function buildCalibrationEvidence(
  priorsMeta: PriorsMeta,
  assumptionsFired: FiredAssumption[],
  audit: CounterfactualAudit,
  semanticSource: SemanticMatrix["source"],
): CalibrationEvidence {
  const confidenceDowngrades: string[] = [...priorsMeta.notes];
  if (priorsMeta.source === "embedded_unverified") {
    confidenceDowngrades.push(
      "Persona trait priors are embedded developer estimates (no data files loaded) — population shape is unvalidated.",
    );
  } else if (priorsMeta.coverage < 0.15) {
    confidenceDowngrades.push(
      "Persona trait priors are almost entirely unsourced (low evidence coverage) — treat population shape as unvalidated.",
    );
  }
  if (audit.status === "not_run") {
    confidenceDowngrades.push(audit.summary);
  }
  if (semanticSource === "fallback_formulas") {
    confidenceDowngrades.push(
      "Semantic grounding unavailable — keyword formulas used; treat product-fit criteria as directional only.",
    );
  }
  return {
    priors_coverage: round(priorsMeta.coverage, 3),
    priors_source: priorsMeta.source,
    assumptions_fired: assumptionsFired,
    counterfactual_audit: audit,
    confidence_downgrades: confidenceDowngrades,
    semantic_source: semanticSource,
  };
}

function topObjectionOf(reactions: PersonaReaction[]): string {
  const counts = new Map<string, number>();
  const raw = new Map<string, string>();
  for (const r of reactions) {
    if (r.first_objection.trim()) {
      const key = normalizeObjection(r.first_objection);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!raw.has(key)) raw.set(key, r.first_objection);
    }
  }
  if (counts.size === 0) return "";
  return raw.get(mostCommon(counts, 1)[0][0])!;
}
