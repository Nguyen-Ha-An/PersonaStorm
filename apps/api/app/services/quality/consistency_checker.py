"""Internal-consistency checker — per-reaction sanity rules (Task 11).

DIAGNOSTIC-ONLY: `check_consistency` never mutates the reaction it inspects.
Score adjustments (if any) belong to the scoring modifiers upstream; this
module only flags reactions whose own numbers contradict each other, which is
a different failure mode from mode-collapse (metrics.py) — a swarm can be
perfectly diverse across personas and still contain individually incoherent
reactions (e.g. "I don't trust this at all" + "I'd buy it immediately").
"""

from __future__ import annotations

from ...schemas.persona import Persona
from ...schemas.reaction import PersonaReaction
from ...utils.text import stddev

# Rule thresholds — documented individually below; tuned so a coherent
# reaction (moderate, correlated scores) never trips any rule (see
# tests/test_consistency.py::test_fully_consistent_reaction_returns_empty).
TRUST_LOW = 0.25          # below this the persona is actively distrustful
BUY_HIGH = 0.75           # above this the persona is near-certain to buy
PRICING_LOW = 0.25        # below this the persona rejects the price outright
WTP_BUDGET_SHARE = 0.4    # stated max_price above 40% of monthly budget = "high" WTP
PROOF_HIGH = 0.70         # above this the persona demands heavy evidence
TRUST_HIGH = 0.70         # above this the persona is already highly trusting
UNIFORM_STDDEV = 0.05     # below this the 17 criteria carry ~no per-persona signal


def check_consistency(persona: Persona, reaction: PersonaReaction) -> list[str]:
    """Return labels of violated internal-consistency rules for one
    persona/reaction pair. Empty list = internally consistent. Read-only —
    does not modify `reaction` or `persona`."""
    scores = reaction.criteria_scores.as_dict()
    trust = scores["trust"]
    pricing_acceptance = scores["pricing_acceptance"]
    proof_requirement = scores["proof_requirement"]

    violations: list[str] = []

    # Distrust but near-certain purchase intent — trust and buy likelihood
    # should move together; a persona that says it doesn't trust the product
    # yet reports very high buy likelihood is contradicting itself.
    if trust < TRUST_LOW and reaction.buy_likelihood > BUY_HIGH:
        violations.append("trust_vs_buy")

    # Rejects the price as unacceptable yet states a willingness to pay well
    # above what "unacceptable" would imply, relative to their own budget.
    if (pricing_acceptance < PRICING_LOW
            and reaction.max_price > WTP_BUDGET_SHARE * persona.monthly_budget_usd):
        violations.append("price_vs_wtp")

    # Demands heavy proof before believing/buying, yet is already highly
    # trusting — these two should be inversely related within one reaction.
    if proof_requirement > PROOF_HIGH and trust > TRUST_HIGH:
        violations.append("proof_vs_trust")

    # All 17 criteria nearly identical -> the reaction carries almost no
    # differentiated signal across criteria (a real report card varies).
    if stddev(list(scores.values())) < UNIFORM_STDDEV:
        violations.append("uniform_criteria")

    return violations


def criteria_consistency_score(
    personas: list[Persona], reactions: list[PersonaReaction]
) -> float:
    """Share of personas (paired by persona_id) whose reaction is internally
    consistent (check_consistency returns []). Range [0,1], higher is better.
    Returns 1.0 when there are no persona/reaction pairs (nothing to fault)."""
    by_id = {p.persona_id: p for p in personas}
    paired = [(by_id[r.persona_id], r) for r in reactions if r.persona_id in by_id]
    if not paired:
        return 1.0
    consistent = sum(1 for p, r in paired if not check_consistency(p, r))
    return consistent / len(paired)
