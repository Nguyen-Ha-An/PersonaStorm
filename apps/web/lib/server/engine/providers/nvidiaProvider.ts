/**
 * NvidiaProvider — NVIDIA NIM (OpenAI-compatible) persona reactions.
 * Port of apps/api/app/services/inference/nvidia_provider.py + llm_common.py.
 *
 * market_fit_score and status are NEVER trusted from the model — always
 * recomputed server-side via computeMarketFit / statusFor.
 */

import { ProviderNotConfiguredError } from "../../errors";
import { clamp } from "../text";
import { classifyCategory, isHighRisk } from "../criteria/classifier";
import { CORE_IDS } from "../criteria/registry";
import { computeMarketFit } from "../criteria/scoring";
import type { StimulusFeatures } from "../stimulusParser";
import { statusFor, type Persona, type PersonaReaction } from "../types";
import { REACTION_JSON_SCHEMA, buildSystemPrompt, buildUserPrompt } from "./prompts";
import { reactBatchDefault, type PersonaInferenceProvider } from "./types";

const PRICING_MODELS = new Set(["one_time", "subscription", "usage_based", "seat_based", "enterprise", "freemium", "unknown"]);
const BEST_NEXT_TESTS = new Set(["survey", "interview", "landing_page_ab_test", "pricing_test", "ad_test", "usability_test"]);

export interface NvidiaOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  useGuidedJson?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}

export class NvidiaProvider implements PersonaInferenceProvider {
  readonly name = "nvidia";
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private useGuidedJson: boolean;
  private maxTokens: number;
  private timeoutMs: number;

  constructor(opts: NvidiaOptions) {
    if (!opts.baseUrl) {
      throw new ProviderNotConfiguredError(
        "INFERENCE_PROVIDER=nvidia but NVIDIA_BASE_URL is not set. Point it at " +
          "https://integrate.api.nvidia.com/v1 (hosted) or your NIM container's /v1 endpoint, " +
          "or use INFERENCE_PROVIDER=mock.",
      );
    }
    if (opts.baseUrl.includes("integrate.api.nvidia.com") && !opts.apiKey) {
      throw new ProviderNotConfiguredError(
        "INFERENCE_PROVIDER=nvidia targets the hosted NVIDIA endpoint but NVIDIA_API_KEY is not set. " +
          "Generate an 'nvapi-' key at build.nvidia.com, set NVIDIA_API_KEY, or switch to mock.",
      );
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.model = opts.model;
    this.useGuidedJson = opts.useGuidedJson ?? true;
    this.maxTokens = opts.maxTokens ?? 2048;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey && this.apiKey !== "not-needed") h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  async react(
    persona: Persona,
    stimulus: string,
    stimulusType: string,
    features: StimulusFeatures | null,
    category: string | null,
  ): Promise<PersonaReaction> {
    const payload: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: buildSystemPrompt(persona) },
        { role: "user", content: buildUserPrompt(stimulus, stimulusType, features) },
      ],
      max_tokens: this.maxTokens,
      temperature: 0.8,
    };
    if (this.useGuidedJson) {
      payload.nvext = { guided_json: REACTION_JSON_SCHEMA };
    } else {
      payload.response_format = { type: "json_object" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let json: { choices?: { message?: { content?: string } }[] };
    try {
      const resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`NVIDIA chat/completions -> ${resp.status}: ${body.slice(0, 300)}`);
      }
      json = await resp.json();
    } finally {
      clearTimeout(timeout);
    }
    const content = json.choices?.[0]?.message?.content ?? "";
    return parseLlmReaction(content, persona, features, category);
  }

  reactBatch(
    personas: Persona[],
    stimulus: string,
    stimulusType: string,
    features: StimulusFeatures | null,
    concurrency: number,
    category: string | null,
  ): Promise<PersonaReaction[]> {
    return reactBatchDefault(this, personas, stimulus, stimulusType, features, concurrency, category);
  }
}

/** Defensive parse of an LLM JSON reply into a PersonaReaction. */
export function parseLlmReaction(
  content: string,
  persona: Persona,
  features: StimulusFeatures | null,
  category: string | null,
): PersonaReaction {
  let text = content.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^`+/, "").replace(/`+$/, "");
    if (text.startsWith("json")) text = text.slice(4);
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`provider returned non-JSON content for ${persona.persona_id}`);
  }
  const data = JSON.parse(text.slice(start, end + 1)) as Record<string, any>;

  if (!data.criteria_scores || typeof data.criteria_scores !== "object") {
    throw new Error(`provider response missing criteria_scores for ${persona.persona_id}`);
  }
  const rawCore = data.criteria_scores as Record<string, unknown>;
  const core: Record<string, number> = {};
  for (const cid of CORE_IDS) core[cid] = clamp(Number(rawCore[cid] ?? 0.5));

  const rawAge = (data.age_specific_scores ?? {}) as Record<string, unknown>;
  const ageSpecific: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawAge)) ageSpecific[String(k)] = clamp(Number(v));

  const buyLikelihood = clamp(Number(data.buy_likelihood ?? 0.5));
  const maxPrice = Math.max(0.0, Number(data.max_price ?? 0.0));

  const cat = category ?? (features ? classifyCategory(features)[0] : "generic");
  const highRisk = features ? isHighRisk(features) : false;
  const isTeenPaidEdu = persona.life_stage === "teen_student" && cat === "education_product";

  const breakdown = computeMarketFit(core, ageSpecific, cat, persona.life_stage, { isHighRisk: highRisk, isTeenPaidEdu });
  const status = statusFor(buyLikelihood);

  let pricingModel = String(data.recommended_pricing_model ?? "unknown");
  if (!PRICING_MODELS.has(pricingModel)) pricingModel = "unknown";

  const qual = (data.qualitative ?? {}) as Record<string, unknown>;
  const qualitative = {
    first_objection: String(qual.first_objection ?? "").slice(0, 280),
    top_positive_trigger: String(qual.top_positive_trigger ?? "").slice(0, 280),
    top_negative_trigger: String(qual.top_negative_trigger ?? "").slice(0, 280),
    dealbreaker: String(qual.dealbreaker ?? "").slice(0, 200),
    proof_needed: String(qual.proof_needed ?? "").slice(0, 200),
    emotional_reaction: String(qual.emotional_reaction ?? "").slice(0, 160),
    would_tell: String(qual.would_tell ?? "").slice(0, 280),
    quote: String(qual.quote ?? "").slice(0, 400),
  };

  const rr = (data.research_recommendation ?? {}) as Record<string, unknown>;
  let bestNextTest = String(rr.best_next_test ?? "survey");
  if (!BEST_NEXT_TESTS.has(bestNextTest)) bestNextTest = "survey";
  const research = {
    should_validate_with_humans: Boolean(rr.should_validate_with_humans ?? true),
    validation_question: String(rr.validation_question ?? "").slice(0, 300),
    best_next_test: bestNextTest,
  };

  return {
    persona_id: persona.persona_id,
    segment: persona.segment,
    sub_segment: persona.sub_segment,
    life_stage: persona.life_stage,
    buy_likelihood: buyLikelihood,
    market_fit_score: breakdown.market_fit_score,
    status,
    max_price: maxPrice,
    currency: "USD",
    recommended_pricing_model: pricingModel,
    criteria_scores: core,
    age_specific_scores: ageSpecific,
    qualitative,
    research_recommendation: research,
    reasoning_summary: String(data.reasoning_summary ?? "").slice(0, 400),
    market_fit_breakdown: breakdown,
    first_objection: qualitative.first_objection,
    quote: qualitative.quote,
    positive_trigger: qualitative.top_positive_trigger,
  };
}
