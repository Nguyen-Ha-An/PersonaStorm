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
import { AssumptionLedger } from "./engine/criteria/assumptions";
import { PersonaGenerator } from "./engine/persona/generator";
import { getProvider } from "./engine/providers";
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
import type { StormReport } from "./engine/report";

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

  // 3) swarm reactions.
  const provider = getProvider(cfg, ledger);
  const reactions: PersonaReaction[] = await provider.reactBatch(
    personas,
    input.stimulus,
    input.stimulusType,
    features,
    MAX_CONCURRENCY,
    category,
  );

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
  // `audit`, `priorsMeta`, and `ledger` are consumed by Task 9; kept in scope
  // here as they're wired into the report/response there.

  // 4) quality metrics.
  const quality = computeQuality(personas, reactions, features);

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
