"""Prompt construction for the NVIDIA GLM-5.2 analyst.

The analyst NEVER receives raw persona reactions — only the already-computed,
aggregated report. It is instructed to treat every number as a fixed input and
produce ONLY narrative text (see ANALYST_JSON_SCHEMA-shaped output described
in the prompt below).
"""

from __future__ import annotations

import json

from ...schemas.report import StormReport

ANALYST_SYSTEM_PROMPT = (
    "You are PersonaStorm's analyst agent. You receive aggregated synthetic "
    "persona data from a product wind tunnel. Your job is to diagnose market "
    "risk, not to pretend the synthetic personas are real humans. Generate a "
    "concise, structured market evaluation report. Do not claim this replaces "
    "human research. Always recommend what should be validated with real "
    "humans next. Output ONLY valid JSON matching the schema."
)


def _aggregates(report: StormReport) -> dict:
    overall = report.overall
    return {
        "product_category": report.product_category,
        "overall": {
            "market_fit_score": overall.market_fit_score if overall else None,
            "confidence": overall.confidence if overall else None,
            "top_blockers": overall.top_blockers if overall else [],
            "top_strengths": overall.top_strengths if overall else [],
        },
        "adoption": {
            "green": report.adoption.green,
            "yellow": report.adoption.yellow,
            "red": report.adoption.red,
            "average_buy_likelihood": report.adoption.average_buy_likelihood,
            "average_market_fit_score": report.adoption.average_market_fit_score,
        },
        "weakest_criteria": [
            {
                "label": c.label,
                "average_score": c.average_score,
                "interpretation": c.interpretation,
            }
            for c in report.weakest_criteria
        ],
        "strongest_criteria": [
            {
                "label": c.label,
                "average_score": c.average_score,
                "interpretation": c.interpretation,
            }
            for c in report.strongest_criteria
        ],
        "top_objections": [
            {"label": o.label, "share": o.share} for o in report.top_objections
        ],
        "segments": [
            {
                "segment": s.segment,
                "adoption_rate": s.adoption_rate,
                "top_objection": s.top_objection,
            }
            for s in report.segments
        ],
        "age_cohorts": [
            {"life_stage": a.life_stage, "top_barrier": a.top_barrier}
            for a in report.age_cohorts
        ],
        "avg_max_price": report.avg_max_price,
    }


_OUTPUT_SCHEMA_DESCRIPTION = """REQUIRED output JSON schema (respond with ONLY this object, no markdown fences, no commentary):
{
  "executive_summary": string,          // <= 6 sentences
  "recommendations": [                  // 3 to 6 items
    {"title": string, "detail": string, "priority": "now" | "next" | "later"}
  ],
  "top_objection_labels": [string],     // re-phrased labels for the top objection clusters, same order/count as input
  "kill_quote": string                  // the single most damaging/representative verbatim-style quote
}

Rules:
- Every number below (scores, counts, rates, prices) is a FIXED input already computed by a calibrated engine. You must NOT invent, restate as different, or alter any number. Only produce narrative text.
- executive_summary must be at most 6 sentences.
- recommendations must contain between 3 and 6 items.
- Always include at least one recommendation about validating findings with real humans (interviews, surveys, or a pilot).
- Do not claim synthetic personas are real humans or that this replaces human research.
"""


def build_analyst_user_prompt(report: StormReport) -> str:
    data = _aggregates(report)
    return (
        "AGGREGATED STORM DATA (all numbers are final and fixed — do not change them):\n"
        + json.dumps(data, indent=2)
        + "\n\n"
        + _OUTPUT_SCHEMA_DESCRIPTION
    )
