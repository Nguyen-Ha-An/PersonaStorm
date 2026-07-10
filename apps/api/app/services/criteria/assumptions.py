"""Assumptions registry + per-run ledger (mirror of apps/web .../criteria/assumptions.ts)."""
from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)

ASSUMPTION_DEFS: dict[str, dict] = {
    "pricing_dealbreaker_injection": {
        "id": "pricing_dealbreaker_injection",
        "description": "Personas with price_sensitivity > 0.72 get a pricing dealbreaker injected (rate-bounded).",
        "evidence_status": "unverified",
        "max_rate": 0.4,
    },
    "privacy_dealbreaker_injection": {
        "id": "privacy_dealbreaker_injection",
        "description": "Personas with privacy_sensitivity > 0.75 get a privacy dealbreaker appended.",
        "evidence_status": "unverified",
    },
    "ai_skeptic_trust_penalty": {
        "id": "ai_skeptic_trust_penalty",
        "description": "AI mention without proof lowers trust (-0.06) for skepticism > 0.6.",
        "evidence_status": "derived",
    },
    "ai_novelty_activation_boost": {
        "id": "ai_novelty_activation_boost",
        "description": "AI mention raises activation for novelty_seeking > 0.55.",
        "evidence_status": "derived",
    },
    "trust_gap_high_proof_modifier": {
        "id": "trust_gap_high_proof_modifier",
        "description": "scoring.py: trust < 0.3 with proof_requirement > 0.75 → -0.05.",
        "evidence_status": "derived",
    },
    "strong_urgent_need_modifier": {
        "id": "strong_urgent_need_modifier",
        "description": "scoring.py: need, fit and urgency all high → +0.04.",
        "evidence_status": "derived",
    },
}


class AssumptionLedger:
    def __init__(self) -> None:
        self._counts: dict[str, int] = {}

    def fire(self, assumption_id: str) -> None:
        if assumption_id not in ASSUMPTION_DEFS:
            msg = f"fired unregistered assumption '{assumption_id}' — register it in ASSUMPTION_DEFS or delete the nudge"
            if os.environ.get("API_ENV") == "prod":
                log.error(msg)
                return
            raise ValueError(msg)
        self._counts[assumption_id] = self._counts.get(assumption_id, 0) + 1

    def fired(self) -> list[dict]:
        return [
            {"id": aid, "evidence_status": ASSUMPTION_DEFS[aid]["evidence_status"], "personas_affected": n}
            for aid, n in self._counts.items()
        ]
