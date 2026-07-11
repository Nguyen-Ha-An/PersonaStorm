"""MockPersonaProvider — deterministic, trait-driven local reaction engine.

This is what makes the P0 demo credible without a GPU:

1. DETERMINISTIC: rng is seeded with (run_seed, persona_id, stimulus_hash), so
   the same persona reacts identically to the same stimulus every run — and
   differently to a changed stimulus. Reproducible on stage.
2. TRAIT-DRIVEN: every one of the 17 core criteria (and the age overlays) is a
   readable function of persona traits + parsed stimulus features, plus small
   deterministic noise — never pure random. buy_likelihood is an adoption-
   weighted blend of those criteria; market_fit is ALWAYS the authoritative
   scorer's output (`compute_market_fit`), never invented here.
3. GROUNDED: objections and quotes reference real anchors (salient tokens,
   detected prices) from the pasted stimulus, so different inputs produce
   visibly different storms.

It intentionally mirrors how the calibrated Gemma model is prompted (see
prompts.py): same inputs, same output schema — so swapping providers changes
quality, not plumbing.
"""

from __future__ import annotations

import hashlib
import random
from typing import TYPE_CHECKING

from ...schemas.persona import Persona
from ...schemas.reaction import (
    Decision,
    CoreCriteriaScores,
    PersonaReaction,
    Qualitative,
    ResearchRecommendation,
    status_for,
)
from ...utils.text import clamp
from ..criteria.age_overlays import overlay_ids_for
from ..criteria.assumptions import AssumptionLedger
from ..criteria.classifier import classify_category, is_high_risk
from ..criteria.registry import CORE_IDS, effective
from ..criteria.scoring import compute_market_fit
from ..stimulus_parser import StimulusFeatures, parse_stimulus
from .base import PersonaInferenceProvider

if TYPE_CHECKING:
    from ..semantic.types import SemanticMatrix

# Grounded-criteria semantic blend weight (spec §7):
# core = w·semantic + (1-w)·formula. Registry-tracked via the
# "semantic_blend_weight" assumption (see ../criteria/assumptions.py).
SEMANTIC_BLEND_WEIGHT = 0.7

# ---------------------------------------------------------------- objection text
# Multiple phrasings per objection key -> low duplicate rate, human texture.
# {price} and {anchor} slots are filled from the actual stimulus.
OBJECTION_TEMPLATES: dict[str, list[str]] = {
    "pricing_unclear": [
        "I can't find what this actually costs",
        "no price anywhere — that usually means 'expensive'",
        "pricing is hidden and I'm not booking a call to find out",
        "if the price isn't shown, I assume I can't afford it",
    ],
    "price_too_high": [
        "${price} is more than I'd ever put into {anchor}",
        "at ${price} it has to replace something I already pay for, and it doesn't",
        "the ${price} price tag doesn't match the value I can see",
        "${price}? my whole budget for this kind of thing is smaller than that",
    ],
    "no_proof": [
        "big claims, zero numbers or case studies",
        "show me one real result before asking me to commit",
        "nothing here proves it beats what I already do manually",
        "no evidence, just adjectives",
    ],
    "ai_hype": [
        "'AI-powered' tells me nothing about what it actually does",
        "reads like AI hype without specifics",
        "every product says AI now — where's the actual capability?",
        "the AI framing feels bolted on to justify the price",
    ],
    "subscription_lockin": [
        "another monthly subscription I'll forget to cancel",
        "subscription lock-in for something I'd use twice a month",
        "I'm cutting subscriptions, not adding them",
        "monthly billing for this feels like a trap",
    ],
    "privacy_vague": [
        "it never says what happens to my data",
        "I'm not feeding my info into this without a clear privacy stance",
        "vague on data handling — that's a no for me",
    ],
    "no_security_docs": [
        "no SOC2, no SSO mention — this dies in our security review",
        "there's no security documentation; procurement won't even look at it",
        "without a compliance page this can't enter our stack",
    ],
    "no_trial": [
        "I'm not paying before trying it",
        "no free trial means no first step for me",
        "let me test it on my own work first — there's no way to",
    ],
    "no_case_studies": [
        "no case studies from companies like ours",
        "who at our size actually uses this? it doesn't say",
        "I need a reference customer, not a feature list",
    ],
    "onboarding_time": [
        "looks like hours of setup before any value shows up",
        "I don't have time to learn another system this quarter",
        "the value is buried behind a migration project",
    ],
    "integration": [
        "doesn't say whether it plugs into the tools we already run",
        "if it doesn't fit our existing stack, it's an instant no",
        "one more disconnected tool is exactly what we don't need",
    ],
    "credibility": [
        "never heard of them and nothing here builds trust",
        "feels too corporate and salesy for me to trust",
        "the copy oversells and that makes me trust it less",
    ],
    "unclear_value": [
        "I read it twice and still can't tell what it does for me",
        "the pitch is a wall of buzzwords with no clear payoff",
        "what problem this solves is buried under jargon",
    ],
    "generic_fit": [
        "I honestly can't tell what problem of mine this solves",
        "it's not obvious this is for someone like me",
        "the pitch never says who it's actually for",
    ],
}

POSITIVE_TEMPLATES: dict[str, list[str]] = {
    "trial": ["the free trial makes it a no-risk look", "free tier means I can test it on a real task"],
    "proof": ["the concrete numbers in the pitch", "actual evidence instead of adjectives"],
    "price_fit": ["the price is inside my budget", "cheap enough to try without thinking twice"],
    "novel_ai": ["the AI angle is genuinely interesting here", "curious whether the AI part actually delivers"],
    "clarity": ["the pitch is unusually clear about what it does", "I understood it in one read — rare"],
    "anchor": ["the {anchor} part actually maps to my problem", "specifically the {anchor} bit — that's my pain point"],
    "none": ["honestly, not much grabbed me", "nothing here speaks to my situation"],
}

EMOTIONS = {
    "green": ["genuinely curious", "quietly excited", "impressed, but checking for the catch",
              "surprised how relevant this is"],
    "yellow": ["interested but wary", "curious with one eyebrow raised", "on the fence",
               "want to believe it, can't yet"],
    "red": ["eye-roll and close the tab", "instant distrust", "bored — seen this pitch before",
            "mildly annoyed by the hype"],
}

# Who this persona would talk to about it, by preset.
AUDIENCES = {
    "sea_genz": ["my group chat", "my classmates", "my followers"],
    "us_smb": ["my ops team", "my founder friends", "our Monday standup"],
    "parents": ["my spouse", "the parents' group chat", "my sister"],
    "enterprise": ["my team in the vendor review", "our procurement channel", "my director"],
    "budget": ["my roommate", "the deals forum", "my family"],
    "early_adopters": ["my Discord", "my Twitter/X feed", "the team Slack"],
    "custom": ["my friends", "my colleagues", "my community"],
}

# Human-readable labels for the weakest-criterion research recommendation.
_CRITERION_LABELS: dict[str, str] = {
    "problem_awareness": "whether people recognize the problem",
    "need_intensity": "how painful the problem really is",
    "urgency": "whether people feel any urgency to solve it",
    "solution_fit": "whether the product actually fits the need",
    "value_clarity": "whether the value is clear",
    "differentiation": "whether it feels different from alternatives",
    "trust": "whether people trust the claims",
    "proof_requirement": "how much proof people demand before buying",
    "pricing_acceptance": "whether the price is acceptable",
    "perceived_roi": "whether it's seen as worth the money",
    "ease_of_understanding": "whether people quickly understand it",
    "workflow_fit": "whether it fits people's existing habits",
    "switching_willingness": "whether people will switch from what they use",
    "activation_likelihood": "whether people would actually try it",
    "repeat_usage_potential": "whether people would keep using it",
    "shareability": "whether people would tell others",
    "retention_potential": "whether people would keep paying",
}

# Which human test best de-risks each weak criterion.
_TEST_FOR_WEAKNESS: dict[str, str] = {
    "pricing_acceptance": "pricing_test",
    "perceived_roi": "pricing_test",
    "value_clarity": "usability_test",
    "ease_of_understanding": "usability_test",
    "differentiation": "landing_page_ab_test",
    "trust": "interview",
    "proof_requirement": "interview",
    "activation_likelihood": "ad_test",
    "shareability": "ad_test",
}


def compute_jitter_offsets(seed: int, persona_id: str) -> dict[str, float]:
    """Persona-stable, stimulus-independent formula jitter (spec §6)."""
    jrng = random.Random(f"jitter:{seed}:{persona_id}")
    return {cid: jrng.gauss(0.0, 0.03) for cid in CORE_IDS}


class MockPersonaProvider(PersonaInferenceProvider):
    name = "mock"

    def __init__(self, seed: int = 1337, ledger: AssumptionLedger | None = None):
        self.seed = seed
        self.ledger = ledger or AssumptionLedger()

    async def react(
        self,
        persona: Persona,
        stimulus: str,
        stimulus_type: str,
        features: StimulusFeatures | None = None,
        category: str | None = None,
        semantic: "SemanticMatrix | None" = None,
    ) -> PersonaReaction:
        f = features or parse_stimulus(stimulus, title="", stimulus_type=stimulus_type)
        stim_hash = hashlib.sha1(stimulus.encode(), usedforsecurity=False).hexdigest()[:10]
        rng = random.Random(f"{self.seed}:{persona.persona_id}:{stim_hash}")

        # The run's authoritative category (explicit override or auto-detected
        # ONCE for the whole run) always wins over re-classifying here — this
        # keeps per-persona scoring consistent with the report's own weights.
        cat = category or classify_category(f)[0]
        high_risk = is_high_risk(f)

        jitter = compute_jitter_offsets(self.seed, persona.persona_id)

        core, overlay = self._score_criteria(persona, f, cat, rng, jitter, semantic)

        # market_fit is ALWAYS the authoritative scorer's output — never invented.
        breakdown = compute_market_fit(
            core, overlay, cat, persona.life_stage,
            is_high_risk=high_risk,
            is_teen_paid_edu=(persona.life_stage == "teen_student"
                              and cat == "education_product"),
        )

        buy = self._buy_likelihood(persona, core, rng)
        status = status_for(buy)

        wtp_base = persona.monthly_budget_usd * (0.25 + 0.55 * (1.0 - persona.price_sensitivity))
        max_price = self._max_price(persona, f, buy, wtp_base, core, status, rng)
        pricing_model = self._pricing_model(f)

        qualitative = self._qualitative(persona, f, core, buy, status, rng)
        research = self._research_recommendation(persona, f, core, rng)
        reasoning = self._reasoning(core, cat, breakdown)

        return PersonaReaction(
            persona_id=persona.persona_id,
            segment=persona.segment,
            sub_segment=persona.sub_segment,
            life_stage=persona.life_stage,
            decision=Decision(
                overall_buy_likelihood=round(buy, 3),
                market_fit_score=breakdown.market_fit_score,
                status=status,
                max_price=max_price,
                currency="USD",
                recommended_pricing_model=pricing_model,
            ),
            criteria_scores=CoreCriteriaScores(**core),
            age_specific_scores=overlay,
            qualitative=qualitative,
            research_recommendation=research,
            reasoning_summary=reasoning,
            market_fit_breakdown=breakdown,
        )

    # ------------------------------------------------------------- criteria
    def _score_criteria(
        self, p: Persona, f: StimulusFeatures, category: str, rng: random.Random,
        jitter: dict[str, float] | None = None,
        semantic: "SemanticMatrix | None" = None,
    ) -> tuple[dict[str, float], dict[str, float]]:
        """Return (core scores for all 17 CORE_IDS, overlay scores for this
        persona's life stage). Every value is grounded in traits + features
        with small deterministic noise — never pure random."""

        def j(scale: float = 0.05) -> float:
            return rng.gauss(0.0, scale)

        # --- pricing signal: how expensive does the product LOOK vs. this
        # persona's budget? Used by pricing_acceptance / perceived_roi.
        wtp_base = p.monthly_budget_usd * (0.25 + 0.55 * (1.0 - p.price_sensitivity))
        if f.has_pricing and f.min_price:
            affordability = clamp(wtp_base / max(1.0, f.min_price), 0.0, 3.0) / 3.0  # 0..1
        else:
            affordability = 0.45  # unknown price reads as mildly negative

        clarity = f.clarity_score            # 0..1
        jargon = f.jargon_score              # 0..1
        proof = 1.0 if f.has_proof else 0.0
        trial = 1.0 if f.has_free_trial else 0.0
        fam = {"low": 0.2, "medium": 0.5, "high": 0.85}.get(p.category_familiarity, 0.5)

        core: dict[str, float] = {}

        # problem / need block
        core["problem_awareness"] = 0.45 + 0.30 * clarity + 0.15 * fam + j()
        core["need_intensity"] = (
            0.40 + 0.25 * (1.0 - fam)          # unfamiliar categories feel more like an unmet need
            + 0.20 * clarity + 0.15 * p.novelty_seeking + j()
        )
        core["urgency"] = 0.35 + 0.30 * core["need_intensity"] + 0.10 * p.novelty_seeking + j()

        # value block
        core["solution_fit"] = 0.42 + 0.28 * clarity + 0.20 * proof - 0.10 * jargon + j()
        core["value_clarity"] = 0.30 + 0.55 * clarity - 0.25 * jargon + j()
        # high category_familiarity -> harder to seem different
        core["differentiation"] = (
            0.55 - 0.30 * fam + 0.15 * (p.novelty_seeking - 0.5) + j()
        )

        # trust / risk block
        core["trust"] = (
            0.55 - 0.30 * (p.skepticism - 0.5)    # skepticism lowers trust
            + 0.18 * (p.brand_trust - 0.5)        # brand trust raises it
            + 0.15 * proof - 0.08 * jargon + j()
        )
        if f.mentions_ai and p.skepticism > 0.6 and not f.has_proof:
            self.ledger.fire("ai_skeptic_trust_penalty")
            core["trust"] -= 0.06
        # proof_requirement is a BARRIER (higher = more proof demanded)
        core["proof_requirement"] = (
            0.35 + 0.35 * p.skepticism + 0.20 * (1.0 - p.brand_trust)
            - 0.18 * proof + j()
        )

        # pricing block
        pa = 0.30 + 0.55 * affordability
        if f.has_pricing and f.min_price and wtp_base < f.min_price:
            pa -= 0.20 * p.price_sensitivity   # expensive-looking + price-sensitive -> lower
        if not f.has_pricing:
            pa -= 0.10 * p.price_sensitivity    # hidden price frustrates price-sensitive buyers
        core["pricing_acceptance"] = pa + j()
        core["perceived_roi"] = (
            0.35 + 0.30 * core["solution_fit"] + 0.20 * proof
            + 0.15 * affordability + j()
        )

        # adoption block
        core["ease_of_understanding"] = 0.30 + 0.55 * clarity - 0.20 * jargon + j()
        core["workflow_fit"] = 0.42 + 0.25 * fam + 0.18 * clarity + j()
        # switching willingness: novelty seekers switch more; skeptics less
        core["switching_willingness"] = (
            0.38 + 0.30 * p.novelty_seeking - 0.15 * p.skepticism
            + 0.12 * trial + j()
        )
        act = 0.38 + 0.22 * clarity + 0.18 * trial + 0.12 * p.novelty_seeking
        if f.mentions_ai and p.novelty_seeking > 0.55:
            self.ledger.fire("ai_novelty_activation_boost")
            act += 0.12 * p.novelty_seeking     # novelty + AI framing -> more likely to try
        core["activation_likelihood"] = act + j()

        # retention / virality block
        core["repeat_usage_potential"] = (
            0.40 + 0.25 * core["solution_fit"] + 0.15 * core["workflow_fit"] + j()
        )
        core["shareability"] = (
            0.30 + 0.35 * p.social_influence + 0.20 * core["value_clarity"] + j()
        )
        core["retention_potential"] = (
            0.38 + 0.25 * core["perceived_roi"] + 0.18 * core["repeat_usage_potential"] + j()
        )

        # --- semantic grounding blend (spec §7) ---------------------------
        # For the 5 grounded criteria, blend the (unclamped, pre-jitter) raw
        # formula value with the semantic assessor's score for THIS persona's
        # segment: core[cid] = 0.7*semantic + 0.3*formula. Fires the
        # "semantic_blend_weight" assumption AT MOST ONCE PER PERSONA (not
        # once per criterion) so personas_affected in calibration_evidence
        # stays population-scoped, matching every other assumption.
        # Only blend when the matrix came from a REAL assessment. A
        # "fallback_formulas" source (mock assessor, or a failed/absent LLM
        # call) means no genuine semantic signal — blending its placeholder
        # scores would inject noise into the 5 grounded criteria AND make the
        # "keyword formulas used" downgrade a lie. Leave the formulas to stand.
        seg = (
            semantic["segments"].get(p.segment)
            if semantic and semantic.get("source") != "fallback_formulas"
            else None
        )
        if seg:
            import math
            from ..semantic.types import GROUNDED_CRITERIA  # local import to avoid cycles

            blended = False
            for cid in GROUNDED_CRITERIA:
                sv = seg["scores"].get(cid)
                # Defense in depth: an injected fixture bypasses sanitize_semantic,
                # so a NaN/out-of-range value must not propagate through clamp.
                if (
                    isinstance(sv, (int, float))
                    and not isinstance(sv, bool)
                    and math.isfinite(sv)
                    and 0 <= sv <= 1
                ):
                    core[cid] = SEMANTIC_BLEND_WEIGHT * sv + (1 - SEMANTIC_BLEND_WEIGHT) * core[cid]
                    blended = True
            if blended:
                self.ledger.fire("semantic_blend_weight")

        jit = jitter or {}
        core = {cid: round(clamp(core[cid] + jit.get(cid, 0.0)), 4) for cid in CORE_IDS}
        overlay = self._score_overlay(p, f, core, rng)
        return core, overlay

    def _score_overlay(
        self, p: Persona, f: StimulusFeatures, core: dict[str, float], rng: random.Random,
    ) -> dict[str, float]:
        """Score the life-stage overlay criteria. Values grounded in decision
        context + traits + features; teen overlays get special handling."""
        ids = overlay_ids_for(p.life_stage)
        if not ids:
            return {}

        def j(scale: float = 0.05) -> float:
            return rng.gauss(0.0, scale)

        dc = p.decision_context
        cheap = 0.0
        if f.has_pricing and f.min_price is not None:
            cheap = clamp((p.monthly_budget_usd - f.min_price) / max(1.0, p.monthly_budget_usd))
        else:
            cheap = 0.4
        trend = 1.0 if f.mentions_ai else 0.5
        social = p.social_influence
        privacy_worry = p.privacy_sensitivity
        needs_parent = bool(dc.needs_parent_approval)

        # Reasonable defaults, then override the ones with strong signal.
        base: dict[str, float] = {}
        for cid in ids:
            base[cid] = clamp(0.45 + 0.20 * (core.get("solution_fit", 0.5) - 0.5) + j())

        # --- teen overlay (identity/peer/parent-driven) ---
        if "peer_influence" in base:
            base["peer_influence"] = clamp(0.35 + 0.45 * social + j())
        if "trend_alignment" in base:
            base["trend_alignment"] = clamp(0.30 + 0.45 * trend + 0.15 * p.novelty_seeking + j())
        if "parent_approval" in base:
            # higher when parents must sign off AND it's cheap/safe-looking
            base["parent_approval"] = clamp(
                (0.55 if needs_parent else 0.45) + 0.25 * cheap
                - 0.20 * privacy_worry + j()
            )
        if "allowance_affordability" in base:
            base["allowance_affordability"] = clamp(0.30 + 0.55 * cheap + j())
        if "safety_concern" in base:  # BARRIER: higher = more worry
            base["safety_concern"] = clamp(
                0.30 + 0.35 * privacy_worry
                + (0.15 if f.mentions_privacy and not f.mentions_security else 0.0) + j()
            )
        if "identity_fit" in base:
            base["identity_fit"] = clamp(0.35 + 0.35 * social + 0.15 * p.novelty_seeking + j())
        if "school_relevance" in base:
            in_school = "school" in (dc.school_context or "")
            rel = 0.45 if in_school else 0.35
            base["school_relevance"] = clamp(rel + 0.30 * core.get("solution_fit", 0.5) + j())
        if "attention_fit" in base:
            short = (dc.attention_span == "short")
            base["attention_fit"] = clamp(
                (0.40 if short else 0.55) + 0.20 * core.get("ease_of_understanding", 0.5) + j()
            )

        # --- other stages: map to relevant core signals so they're not flat ---
        if "budget_fit" in base:
            base["budget_fit"] = clamp(0.30 + 0.55 * cheap + j())
        if "household_budget_fit" in base:
            base["household_budget_fit"] = clamp(0.30 + 0.55 * cheap + j())
        if "trialability" in base:
            base["trialability"] = clamp(0.35 + (0.40 if f.has_free_trial else 0.0) + j())
        if "child_safety" in base:
            base["child_safety"] = clamp(0.45 + 0.20 * (1.0 - privacy_worry)
                                         + (0.10 if f.mentions_security else 0.0) + j())
        if "outcome_proof" in base:
            base["outcome_proof"] = clamp(0.35 + (0.40 if f.has_proof else 0.0) + j())
        if "subscription_fatigue" in base:  # BARRIER
            base["subscription_fatigue"] = clamp(
                0.30 + (0.30 if f.mentions_subscription else 0.0)
                + 0.20 * (1.0 - p.risk_tolerance) + j()
            )
        if "productivity_gain" in base:
            base["productivity_gain"] = clamp(0.35 + 0.30 * core.get("perceived_roi", 0.5) + j())
        if "professional_credibility" in base:
            base["professional_credibility"] = clamp(0.35 + 0.30 * core.get("trust", 0.5) + j())

        return {cid: round(base[cid], 4) for cid in ids}

    # ---------------------------------------------------------- buy likelihood
    def _buy_likelihood(self, p: Persona, core: dict[str, float], rng: random.Random) -> float:
        """Adoption-weighted blend of criteria + a need x fit interaction bonus
        minus switching inertia. Correlated-but-distinct from market_fit."""
        drivers = [
            core["need_intensity"], core["solution_fit"], core["pricing_acceptance"],
            core["trust"], core["activation_likelihood"], core["switching_willingness"],
        ]
        base = sum(drivers) / len(drivers)
        interaction = 0.15 * core["need_intensity"] * core["solution_fit"]
        # switching inertia: the default action is "do nothing"; novelty-seekers
        # overcome it more easily.
        inertia = 0.10 + 0.10 * (1.0 - p.novelty_seeking)
        score = base + interaction - inertia + rng.gauss(0.0, 0.05)
        return clamp(score, 0.02, 0.97)

    # ----------------------------------------------------------------- pricing
    def _max_price(self, p: Persona, f: StimulusFeatures, buy: float,
                   wtp_base: float, core: dict[str, float], status: str,
                   rng: random.Random) -> float:
        if status == "red" and rng.random() < 0.30 + 0.35 * p.price_sensitivity:
            return 0.0
        pa = core["pricing_acceptance"]
        # Budget-derived ceiling, scaled by enthusiasm AND price acceptance.
        ceiling = wtp_base * (0.45 + 0.75 * buy) * (0.6 + 0.6 * pa)
        if f.has_pricing and f.min_price:
            sensitivity_factor = 1.15 - 0.5 * p.price_sensitivity
            anchored = f.min_price * (0.5 + 1.3 * buy) * sensitivity_factor
            wtp = min(ceiling, anchored)
        else:
            wtp = ceiling
        wtp *= rng.uniform(0.85, 1.15)
        return _round_price(max(0.0, wtp))

    def _pricing_model(self, f: StimulusFeatures):
        """Infer the pricing model from stimulus wording. Checked most-specific
        first (enterprise > freemium > seat/usage > subscription > one-off)."""
        lower = f.raw.lower()
        toks = set(f.tokens)
        if any(w in lower for w in ("enterprise", "sso", "saml", "soc2", "soc-2", "procurement")):
            return "enterprise"
        if "freemium" in lower or ("free" in toks and not f.has_pricing):
            return "freemium"
        if any(w in lower for w in ("per seat", "/seat", "per user", "/user", " seats")):
            return "seat_based"
        if any(w in lower for w in ("usage-based", "usage based", "pay-as-you-go",
                                    "pay as you go", "per request", "metered", "credits")):
            return "usage_based"
        if f.mentions_subscription:
            return "subscription"
        if f.has_pricing:
            return "one_time"
        return "unknown"

    # --------------------------------------------------------------- qualitative
    def _qualitative(self, p: Persona, f: StimulusFeatures, core: dict[str, float],
                     buy: float, status: str, rng: random.Random) -> Qualitative:
        objection_key, objection = self._pick_objection(p, f, core, buy, rng)
        positive = self._pick_positive(p, f, buy, rng)
        anchor = self._anchor(f, rng)
        quote = self._quote(p, f, status, objection, positive, anchor, rng)
        emotional = rng.choice(EMOTIONS[status])
        audience = rng.choice(AUDIENCES.get(p.preset, AUDIENCES["custom"]))
        would_tell = {
            "green": f"I'd tell {audience} to take a look at this",
            "yellow": f"I'd mention it to {audience}, but with a 'not sure yet'",
            "red": f"I'd tell {audience} not to bother",
        }[status]

        # top_negative_trigger: the dominant negative (the objection theme).
        negative = self._negative_trigger(objection_key, core)
        dealbreaker = self._dealbreaker(p, f)
        proof_needed = self._proof_needed(p, f, core)

        return Qualitative(
            first_objection=objection,
            top_positive_trigger=positive,
            top_negative_trigger=negative,
            dealbreaker=dealbreaker,
            proof_needed=proof_needed,
            emotional_reaction=emotional,
            would_tell=would_tell,
            quote=quote,
        )

    _NEGATIVE_BY_KEY: dict[str, str] = {
        "pricing_unclear": "hidden pricing",
        "price_too_high": "price above budget",
        "no_proof": "no evidence for the claims",
        "no_case_studies": "no reference customers",
        "ai_hype": "AI framing without substance",
        "subscription_lockin": "subscription lock-in",
        "privacy_vague": "unclear data handling",
        "no_security_docs": "missing security/compliance",
        "no_trial": "no way to try before paying",
        "onboarding_time": "setup effort",
        "integration": "unclear fit with existing tools",
        "credibility": "weak credibility",
        "unclear_value": "unclear value",
        "generic_fit": "not obviously for me",
    }

    def _negative_trigger(self, objection_key: str, core: dict[str, float]) -> str:
        return self._NEGATIVE_BY_KEY.get(objection_key, "not convinced yet")

    def _dealbreaker(self, p: Persona, f: StimulusFeatures) -> str:
        """The persona's most relevant dealbreaker given the stimulus."""
        db = list(p.dealbreakers)
        if not db:
            return ""

        def matches(fragment: str) -> str | None:
            for d in db:
                if fragment in d.lower():
                    return d
            return None

        # Prefer a dealbreaker the stimulus actually triggers.
        if not f.has_pricing:
            hit = matches("pricing") or matches("fees")
            if hit:
                return hit
        if not f.has_proof:
            hit = matches("proof") or matches("case")
            if hit:
                return hit
        if not f.mentions_security:
            hit = matches("data") or matches("compliance") or matches("soc")
            if hit:
                return hit
        if not f.has_free_trial:
            hit = matches("trial") or matches("credit card")
            if hit:
                return hit
        return db[0]

    def _proof_needed(self, p: Persona, f: StimulusFeatures, core: dict[str, float]) -> str:
        pr = core["proof_requirement"]
        if f.has_proof and pr < 0.5:
            return "the proof shown is roughly enough for me"
        if pr >= 0.65:
            return "hard evidence: real numbers or a case study from someone like me"
        if pr >= 0.45:
            return "a concrete before/after result or a reference customer"
        return "a quick demo would settle it"

    # -------------------------------------------------------------- objections
    def _pick_objection(self, p: Persona, f: StimulusFeatures, core: dict[str, float],
                        buy: float, rng: random.Random) -> tuple[str, str]:
        db = set(p.dealbreakers)
        cands: list[tuple[str, float]] = []

        def has_db(*fragments: str) -> bool:
            return any(any(fr in d for d in db) for fr in fragments)

        # Evidence-justified objections are candidates for EVERY persona,
        # weighted by the relevant trait; a matching dealbreaker BOOSTS weight
        # x1.5 instead of gating inclusion (spec §9 — pools no longer
        # predetermine blockers).
        def w(base: float, *fragments: str) -> float:
            return base * 1.5 if fragments and has_db(*fragments) else base

        if not f.has_pricing:
            cands.append(("pricing_unclear", w(0.7 * p.price_sensitivity, "pricing", "hidden fees")))
        if f.has_pricing and f.min_price:
            wtp = p.monthly_budget_usd * (0.25 + 0.55 * (1 - p.price_sensitivity))
            if f.min_price > wtp:
                cands.append(("price_too_high", w(0.9 * p.price_sensitivity, "pricing", "hidden fees")))
        if not f.has_proof:
            cands.append(("no_proof", w(0.7 * p.skepticism, "proof")))
            cands.append(("no_case_studies", w(0.45 * p.skepticism, "case studies")))
        if f.mentions_ai and not f.has_proof:
            cands.append(("ai_hype", w(0.65 * p.skepticism, "AI hype")))
        if f.mentions_subscription:
            cands.append(("subscription_lockin", w(0.5 * (1.0 - p.risk_tolerance), "lock-in", "cancel")))
        if not f.mentions_security:
            cands.append(("no_security_docs", w(0.55 * p.privacy_sensitivity, "SSO", "compliance")))
            cands.append(("privacy_vague", w(0.5 * p.privacy_sensitivity, "data")))
        if not f.has_free_trial:
            cands.append(("no_trial", w(0.5 * p.price_sensitivity, "trial", "credit card")))
        cands.append(("onboarding_time", w(0.3 * (1.0 - p.novelty_seeking), "onboarding", "time", "another tool")))
        if has_db("tools we already use"):
            cands.append(("integration", 0.6))
        if has_db("corporate") or (f.jargon_score > 0.4 and p.brand_trust < 0.45):
            cands.append(("credibility", 0.5 * (1.0 - p.brand_trust)))
        # value-clarity driven objection (grounded in the criteria, not just DB)
        if core["value_clarity"] < 0.4 or core["ease_of_understanding"] < 0.4:
            cands.append(("unclear_value", 0.7 * (1.0 - core["value_clarity"])))
        if not cands:
            cands.append(("generic_fit", 0.5))

        key = max(cands, key=lambda c: c[1] * (0.7 + 0.6 * rng.random()))[0]
        template = rng.choice(OBJECTION_TEMPLATES[key])
        text = template.replace("{price}", _fmt_price(f.min_price)) \
                       .replace("{anchor}", self._anchor(f, rng))
        if buy >= 0.62:
            text = rng.choice([
                f"only thing I'd check: {text}",
                f"minor worry — {text}",
                f"before paying I'd still ask: {text}",
            ])
        return key, text

    def _pick_positive(self, p: Persona, f: StimulusFeatures, buy: float,
                       rng: random.Random) -> str:
        pool: list[tuple[str, float]] = []
        if f.has_free_trial:
            pool.append(("trial", 0.6 + 0.4 * p.price_sensitivity))
        if f.has_proof:
            pool.append(("proof", 0.5 + 0.5 * p.skepticism))
        if f.has_pricing and f.min_price and f.min_price <= p.monthly_budget_usd:
            pool.append(("price_fit", 0.6 * (1 - p.price_sensitivity) + 0.3))
        if f.mentions_ai and p.novelty_seeking > 0.55:
            pool.append(("novel_ai", 0.4 + 0.6 * p.novelty_seeking))
        if f.clarity_score > 0.65:
            pool.append(("clarity", 0.5))
        if f.anchors:
            pool.append(("anchor", 0.55))
        if not pool or buy < 0.18:
            key = "none"
        else:
            key = max(pool, key=lambda c: c[1] * (0.7 + 0.6 * rng.random()))[0]
        return rng.choice(POSITIVE_TEMPLATES[key]).replace("{anchor}", self._anchor(f, rng))

    # -------------------------------------------------------- research recommendation
    def _research_recommendation(self, p: Persona, f: StimulusFeatures,
                                 core: dict[str, float],
                                 rng: random.Random) -> ResearchRecommendation:
        """Pick the persona's WEAKEST core criterion (lowest EFFECTIVE score —
        so a high barrier counts as weak) and map it to the best human test."""
        weakest = min(CORE_IDS, key=lambda cid: effective(cid, core[cid]))
        test = _TEST_FOR_WEAKNESS.get(weakest, "survey")
        anchor = self._anchor(f, rng)
        label = _CRITERION_LABELS.get(weakest, weakest.replace("_", " "))
        question = f"With real users, validate {label} for '{anchor}' before scaling spend."
        return ResearchRecommendation(
            should_validate_with_humans=True,
            validation_question=question[:300],
            best_next_test=test,
        )

    # ------------------------------------------------------------------- text
    def _anchor(self, f: StimulusFeatures, rng: random.Random) -> str:
        pool = f.anchors[:6] or ([f.title] if f.title else ["this"])
        chosen = rng.choice(pool)
        if f.title and chosen.lower() == f.title.lower():
            return f.title
        return chosen

    _OPENERS_NEUTRAL = ["", "", "", "Honestly, ", "For what it's worth, ", "Quick take: ",
                        "My first reaction: ", "Gut feel — "]
    _OPENERS_CASUAL = ["", "", "ngl, ", "ok so ", "real talk: ", "hmm — "]
    _YELLOW_TAILS = ["", "", " Convince me and I'm in.", " I'd wait for reviews.",
                     " Maybe next month.", " I'll sit on it.", " Someone else can go first."]

    def _quote(self, p: Persona, f: StimulusFeatures, status: str, objection: str,
               positive: str, anchor: str, rng: random.Random) -> str:
        casual = p.preset in ("sea_genz", "early_adopters") or p.age < 26
        opener = rng.choice(self._OPENERS_CASUAL if casual else self._OPENERS_NEUTRAL)
        if status == "green":
            opts = [
                f"Okay, '{anchor}' is exactly what I keep struggling with — and {positive}.",
                f"This one I'd actually try: {positive}, and the {anchor} part fits my situation.",
                f"Rare — a pitch that matches my problem. {positive.capitalize()}.",
                f"The {anchor} angle lands for me. {positive.capitalize()}.",
            ]
            if casual:
                opts.append(f"the {anchor} part got me. {positive.capitalize()} — I'd try it.")
        elif status == "yellow":
            tail = rng.choice(self._YELLOW_TAILS)
            opts = [
                f"I like the idea of {anchor}, but {objection}.{tail}",
                f"Half-convinced. {positive.capitalize()}, but {objection}.{tail}",
                f"I'd shortlist it, not buy it — {objection}.{tail}",
                f"Tempted by the {anchor} angle; held back because {objection}.{tail}",
            ]
        else:
            opts = [
                f"I'd close the page — {objection}.",
                f"{objection[0].upper()}{objection[1:]}. That's where I stop reading.",
                f"Not for me: {objection}.",
                f"This is a pass. {objection[0].upper()}{objection[1:]}.",
                f"Nothing for me here — {objection}.",
            ]
            if casual:
                opts.append(f"scrolled past. {objection}.")
        body = rng.choice(opts)
        return f"{opener}{body}" if opener else body

    def _reasoning(self, core: dict[str, float], category: str, breakdown) -> str:
        """Short public rationale naming the top 2 criterion contributions to
        the market-fit score — a truthful description of the actual weighted
        computation (same weights compute_market_fit used), not a
        chain-of-thought."""
        from ..criteria.presets import resolve_preset
        preset = resolve_preset(category)
        contribs = sorted(
            ((cid, preset.weights[cid] * effective(cid, core[cid])) for cid in CORE_IDS),
            key=lambda x: x[1], reverse=True,
        )[:2]
        names = " and ".join(_CRITERION_LABELS.get(cid, cid).replace("whether ", "")
                             for cid, _ in contribs)
        verdict = "strong fit" if breakdown.market_fit_score >= 0.55 else \
                  ("weak fit" if breakdown.market_fit_score < 0.4 else "mixed fit")
        return (f"Market fit here is driven most by {names} "
                f"(fit {breakdown.market_fit_score:.2f} — {verdict}).")[:400]


def _fmt_price(price: float | None) -> str:
    if price is None:
        return "that price"
    return f"{price:g}"


def _round_price(v: float) -> float:
    """Humans think in price steps, not floats."""
    if v <= 0:
        return 0.0
    if v < 10:
        return round(v * 2) / 2
    if v < 50:
        return float(round(v))
    if v < 200:
        return float(round(v / 5) * 5)
    return float(round(v / 10) * 10)
