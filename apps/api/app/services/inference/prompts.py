"""Prompt construction for the real LLM providers (Fireworks / vLLM-Gemma).

Kept provider-agnostic so the exact same prompts run on Fireworks-hosted Gemma
and on vLLM/MI300X — meaning calibration work is portable across serving
backends.

Product rules encoded in the prompt:
- The model reacts AS the persona (persona-conditioning, not persona-training).
- Output is STRICT JSON matching the PersonaReaction schema.
- `reasoning_summary` is a 1-sentence public rationale — the prompt explicitly
  forbids chain-of-thought / step-by-step deliberation in the output.
"""

from __future__ import annotations

import json

from ...schemas.persona import Persona
from ..stimulus_parser import StimulusFeatures

# JSON Schema handed to guided decoding (vLLM guided_json / Fireworks
# response_format). Mirror of schemas/reaction.py minus server-filled fields.
REACTION_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "buy_likelihood": {"type": "number", "minimum": 0, "maximum": 1},
        "max_price": {"type": "number", "minimum": 0},
        "first_objection": {"type": "string", "maxLength": 240},
        "positive_trigger": {"type": "string", "maxLength": 240},
        "emotional_reaction": {"type": "string", "maxLength": 120},
        "would_tell": {"type": "string", "maxLength": 240},
        "quote": {"type": "string", "maxLength": 400},
        "reasoning_summary": {"type": "string", "maxLength": 300},
    },
    "required": [
        "buy_likelihood", "max_price", "first_objection", "positive_trigger",
        "emotional_reaction", "would_tell", "quote", "reasoning_summary",
    ],
    "additionalProperties": False,
}


def build_system_prompt(persona: Persona) -> str:
    p = persona
    return f"""You are simulating ONE specific consumer persona reacting to a product stimulus.
You are NOT an assistant here. Stay strictly in character. React the way THIS person would.

PERSONA:
{json.dumps(p.model_dump(), indent=2)}

BEHAVIOR RULES:
- Your price sensitivity of {p.price_sensitivity} strongly caps your max_price relative to your monthly budget (${p.monthly_budget_usd}/mo discretionary).
- Your skepticism of {p.skepticism} controls how much proof you demand before believing claims.
- Your dealbreakers are real: if the stimulus trips one, it must show up in your objection.
- Be specific. Reference concrete parts of the stimulus (features, wording, prices). Never respond with generic filler like "seems useful" or "interesting product".
- You are a synthetic persona. Never claim to be a real human or cite fabricated personal history verifiable in the real world.

OUTPUT RULES:
- Respond with ONE JSON object only, matching the given schema. No markdown, no commentary.
- `reasoning_summary` = one short sentence linking your traits to your verdict
  (example: "High price sensitivity + no visible pricing makes me assume I can't afford it").
  Do NOT include step-by-step reasoning or deliberation anywhere in the output."""


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
