/**
 * Prompt construction + JSON schema for the real LLM provider (NVIDIA NIM,
 * OpenAI-compatible). Port of apps/api/app/services/inference/prompts.py.
 * The model never returns market_fit_score or status — those are computed
 * server-side by computeMarketFit / statusFor.
 */

import { CORE_IDS } from "../criteria/registry";
import type { StimulusFeatures } from "../stimulusParser";
import type { Persona } from "../types";

export const REACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    criteria_scores: {
      type: "object",
      properties: Object.fromEntries(CORE_IDS.map((cid) => [cid, { type: "number", minimum: 0, maximum: 1 }])),
      required: [...CORE_IDS],
      additionalProperties: false,
    },
    age_specific_scores: {
      type: "object",
      additionalProperties: { type: "number", minimum: 0, maximum: 1 },
    },
    qualitative: {
      type: "object",
      properties: {
        first_objection: { type: "string" },
        top_positive_trigger: { type: "string" },
        top_negative_trigger: { type: "string" },
        dealbreaker: { type: "string" },
        proof_needed: { type: "string" },
        emotional_reaction: { type: "string" },
        would_tell: { type: "string" },
        quote: { type: "string" },
      },
      required: ["first_objection", "top_positive_trigger", "top_negative_trigger", "dealbreaker", "proof_needed", "emotional_reaction", "would_tell", "quote"],
      additionalProperties: false,
    },
    buy_likelihood: { type: "number", minimum: 0, maximum: 1 },
    max_price: { type: "number", minimum: 0 },
    recommended_pricing_model: {
      type: "string",
      enum: ["one_time", "subscription", "usage_based", "seat_based", "enterprise", "freemium", "unknown"],
    },
    research_recommendation: {
      type: "object",
      properties: {
        should_validate_with_humans: { type: "boolean" },
        validation_question: { type: "string" },
        best_next_test: {
          type: "string",
          enum: ["survey", "interview", "landing_page_ab_test", "pricing_test", "ad_test", "usability_test"],
        },
      },
      required: ["should_validate_with_humans", "validation_question", "best_next_test"],
      additionalProperties: false,
    },
    reasoning_summary: { type: "string", maxLength: 400 },
  },
  required: ["criteria_scores", "qualitative", "buy_likelihood", "max_price", "recommended_pricing_model", "research_recommendation", "reasoning_summary"],
  additionalProperties: false,
};

export function buildSystemPrompt(p: Persona): string {
  return `You are simulating this specific persona's market reaction. You are NOT a helpful assistant giving generic advice. Evaluate the product through the criteria schema. Be specific, skeptical when appropriate, and consistent with the persona profile.

PERSONA:
${JSON.stringify(p, null, 2)}

BEHAVIOR RULES:
- Your price sensitivity of ${p.price_sensitivity} strongly caps your max_price relative to your monthly budget ($${p.monthly_budget_usd}/mo discretionary).
- Your skepticism of ${p.skepticism} controls how much proof you demand before believing claims.
- Your dealbreakers are real: if the stimulus trips one, it must show up in your objection.
- Your life_stage and decision_context (parent approval, budget control, influence sources) shape how you actually decide — respect them.
- Score every one of the 17 core criteria in criteria_scores, and any relevant age_specific_scores overlay, based on THIS persona reacting to THIS stimulus.
- Be specific. Reference concrete parts of the stimulus (features, wording, prices).
- FORBIDDEN: generic filler such as "seems innovative", "some people may like it", or "it depends". Every judgment must tie back to a concrete stimulus detail and a concrete persona trait.
- You are a synthetic persona. Never claim to be a real human or cite fabricated personal history verifiable in the real world.

OUTPUT RULES:
- Respond with ONE JSON object only, matching the given schema. No markdown, no commentary.
- Do NOT include chain-of-thought or step-by-step reasoning/deliberation anywhere in the output.
- Do NOT return market_fit_score or status — those are computed by the server, not you.
- \`reasoning_summary\` = one short, public-facing sentence linking your traits to your verdict.
  It is never hidden reasoning, only the one-sentence public explanation.
- Output ONLY valid JSON.`;
}

export function buildUserPrompt(stimulus: string, stimulusType: string, features: StimulusFeatures | null): string {
  let hints = "";
  if (features) {
    const known: string[] = [];
    if (features.hasPricing && features.minPrice !== null) known.push(`visible pricing from $${features.minPrice}`);
    if (features.hasFreeTrial) known.push("free trial/tier mentioned");
    if (!features.hasProof) known.push("no proof/case-study evidence present");
    if (known.length > 0) hints = "\n(Parser hints: " + known.join("; ") + ")";
  }
  return `STIMULUS TYPE: ${stimulusType}

STIMULUS:
---
${stimulus}
---${hints}

React as your persona. Output the single JSON object now.`;
}
