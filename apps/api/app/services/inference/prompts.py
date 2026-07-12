"""Prompt construction for the real LLM providers (NVIDIA / vLLM-Gemma).

Kept provider-agnostic so the exact same prompts run on NVIDIA-hosted models
and on vLLM/MI300X — meaning calibration work is portable across serving
backends.

Product rules encoded in the prompt:
- The model reacts AS the persona (persona-conditioning, not persona-training),
  evaluated through the criteria schema — not a generic assistant giving
  generic advice.
- Output is STRICT JSON matching REACTION_JSON_SCHEMA (nested criteria_scores,
  qualitative, research_recommendation — the model never returns
  market_fit_score or status; those are always computed server-side).
- `reasoning_summary` is a 1-sentence public rationale — the prompt explicitly
  forbids chain-of-thought / step-by-step deliberation in the output.
"""

from __future__ import annotations

import json

from ...schemas.persona import Persona
from ..criteria.registry import CORE_IDS
from ..stimulus_parser import StimulusFeatures

# JSON Schema handed to guided decoding (vLLM guided_json / NVIDIA
# nvext.guided_json). Mirror of schemas/reaction.py
# minus the server-computed fields (market_fit_score, status).
REACTION_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "criteria_scores": {
            "type": "object",
            "properties": {cid: {"type": "number", "minimum": 0, "maximum": 1} for cid in CORE_IDS},
            "required": list(CORE_IDS),
            "additionalProperties": False,
        },
        "age_specific_scores": {
            "type": "object",
            "additionalProperties": {"type": "number", "minimum": 0, "maximum": 1},
        },
        # String caps mirror parse_llm_reaction's slice limits — unbounded
        # strings let a hot-temperature persona ramble past max_tokens under
        # constrained decoding, truncating the JSON mid-string.
        "qualitative": {
            "type": "object",
            "properties": {
                "first_objection": {"type": "string", "maxLength": 280},
                "top_positive_trigger": {"type": "string", "maxLength": 280},
                "top_negative_trigger": {"type": "string", "maxLength": 280},
                "dealbreaker": {"type": "string", "maxLength": 200},
                "proof_needed": {"type": "string", "maxLength": 200},
                "emotional_reaction": {"type": "string", "maxLength": 160},
                "would_tell": {"type": "string", "maxLength": 280},
                "quote": {"type": "string", "maxLength": 400},
            },
            "required": [
                "first_objection", "top_positive_trigger", "top_negative_trigger",
                "dealbreaker", "proof_needed", "emotional_reaction", "would_tell", "quote",
            ],
            "additionalProperties": False,
        },
        "buy_likelihood": {"type": "number", "minimum": 0, "maximum": 1},
        "max_price": {"type": "number", "minimum": 0},
        "recommended_pricing_model": {
            "type": "string",
            "enum": ["one_time", "subscription", "usage_based", "seat_based",
                     "enterprise", "freemium", "unknown"],
        },
        "research_recommendation": {
            "type": "object",
            "properties": {
                "should_validate_with_humans": {"type": "boolean"},
                "validation_question": {"type": "string", "maxLength": 300},
                "best_next_test": {
                    "type": "string",
                    "enum": ["survey", "interview", "landing_page_ab_test",
                             "pricing_test", "ad_test", "usability_test"],
                },
            },
            "required": ["should_validate_with_humans", "validation_question", "best_next_test"],
            "additionalProperties": False,
        },
        "reasoning_summary": {"type": "string", "maxLength": 400},
    },
    "required": [
        "criteria_scores", "qualitative", "buy_likelihood", "max_price",
        "recommended_pricing_model", "research_recommendation", "reasoning_summary",
    ],
    "additionalProperties": False,
}


def build_system_prompt(persona: Persona) -> str:
    p = persona
    return f"""You are simulating this specific persona's market reaction. You are NOT a helpful assistant giving generic advice. Evaluate the product through the criteria schema. Be specific, skeptical when appropriate, and consistent with the persona profile.

PERSONA:
{json.dumps(p.model_dump(), indent=2)}

BEHAVIOR RULES:
- Your price sensitivity of {p.price_sensitivity} strongly caps your max_price relative to your monthly budget (${p.monthly_budget_usd}/mo discretionary).
- Your skepticism of {p.skepticism} controls how much proof you demand before believing claims.
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
- `reasoning_summary` = one short, public-facing sentence linking your traits to your verdict
  (example: "High price sensitivity + no visible pricing makes me assume I can't afford it").
  It is never hidden reasoning, only the one-sentence public explanation.
- Output ONLY valid JSON."""


def build_user_prompt(stimulus: str, stimulus_type: str,
                      features: StimulusFeatures | None) -> str:
    hints = ""
    if features is not None:
        known = []
        if features.has_pricing and features.min_price is not None:
            known.append(f"visible pricing from ${features.min_price}")
        if features.has_free_trial:
            known.append("free trial/tier mentioned")
        if not features.has_proof:
            known.append("no proof/case-study evidence present")
        if known:
            hints = "\n(Parser hints: " + "; ".join(known) + ")"
    return f"""STIMULUS TYPE: {stimulus_type}

STIMULUS:
---
{stimulus}
---{hints}

React as your persona. Output the single JSON object now."""
