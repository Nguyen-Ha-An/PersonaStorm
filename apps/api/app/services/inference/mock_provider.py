"""MockPersonaProvider — deterministic, trait-driven local reaction engine.

This is what makes the P0 demo credible without a GPU:

1. DETERMINISTIC: rng is seeded with (run_seed, persona_id, stimulus_hash), so
   the same persona reacts identically to the same stimulus every run — and
   differently to a changed stimulus. Reproducible on stage.
2. TRAIT-DRIVEN: buy_likelihood is a sum of interpretable factor contributions
   (price fit x price_sensitivity, proof presence x skepticism, AI framing x
   novelty_seeking, ...). The factor ledger also powers `reasoning_summary`,
   so explanations are honest descriptions of the actual scoring — a public
   rationale, never a fabricated chain-of-thought.
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

from ...schemas.persona import Persona
from ...schemas.reaction import PersonaReaction, status_for
from ...utils.text import clamp
from ..stimulus_parser import StimulusFeatures, parse_stimulus
from .base import PersonaInferenceProvider

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


class MockPersonaProvider(PersonaInferenceProvider):
    name = "mock"

    def __init__(self, seed: int = 1337):
        self.seed = seed

    async def react(
        self,
        persona: Persona,
        stimulus: str,
        stimulus_type: str,
        features: StimulusFeatures | None = None,
    ) -> PersonaReaction:
        f = features or parse_stimulus(stimulus, title="", stimulus_type=stimulus_type)
        stim_hash = hashlib.sha1(stimulus.encode()).hexdigest()[:10]
        rng = random.Random(f"{self.seed}:{persona.persona_id}:{stim_hash}")

        score, ledger, wtp_base = self._score(persona, f, rng)
        status = status_for(score)

        objection_key, objection = self._pick_objection(persona, f, score, rng)
        positive = self._pick_positive(persona, f, score, rng)
        max_price = self._max_price(persona, f, score, wtp_base, status, rng)

        anchor = self._anchor(f, rng)
        quote = self._quote(persona, f, status, objection, positive, anchor, rng)
        emotional = rng.choice(EMOTIONS[status])
        audience = rng.choice(AUDIENCES.get(persona.preset, AUDIENCES["custom"]))
        would_tell = {
            "green": f"I'd tell {audience} to take a look at this",
            "yellow": f"I'd mention it to {audience}, but with a 'not sure yet'",
            "red": f"I'd tell {audience} not to bother",
        }[status]

        return PersonaReaction(
            persona_id=persona.persona_id,
            segment=persona.segment,
            sub_segment=persona.sub_segment,
            buy_likelihood=round(score, 3),
            status=status,
            max_price=max_price,
            first_objection=objection,
            positive_trigger=positive,
            emotional_reaction=emotional,
            would_tell=would_tell,
            quote=quote,
            reasoning_summary=self._reasoning(persona, ledger, status),
        )

    # ------------------------------------------------------------------ scoring
    def _score(self, p: Persona, f: StimulusFeatures,
               rng: random.Random) -> tuple[float, list[tuple[str, float]], float]:
        """Returns (buy_likelihood, factor ledger, base willingness to pay)."""
        ledger: list[tuple[str, float]] = []
        score = 0.5

        def add(label: str, delta: float) -> None:
            nonlocal score
            score += delta
            ledger.append((label, delta))

        # willingness to pay: budget discounted by price sensitivity
        wtp_base = p.monthly_budget_usd * (0.25 + 0.55 * (1.0 - p.price_sensitivity))

        # --- price fit ---------------------------------------------------------
        if f.has_pricing and f.min_price:
            affordability = wtp_base / f.min_price
            if affordability >= 2.0:
                add("price well within budget", +0.12)
            elif affordability >= 1.0:
                add("price affordable", +0.04)
            elif affordability >= 0.5:
                add("price above comfort zone", -(0.10 + 0.10 * p.price_sensitivity))
            else:
                add("price far above budget", -(0.18 + 0.15 * p.price_sensitivity))
        else:
            add("no visible pricing", -0.08 * p.price_sensitivity)

        # --- proof vs skepticism -------------------------------------------------
        if f.has_proof:
            add("evidence present", 0.03 + 0.10 * p.skepticism)
            add("social proof", 0.06 * p.social_influence)
        else:
            add("no proof for claims", -0.15 * p.skepticism)

        # --- trial lowers risk ---------------------------------------------------
        if f.has_free_trial:
            add("free trial lowers risk", 0.05 + 0.06 * p.price_sensitivity)
        else:
            add("no trial to de-risk", -0.06 * (1.0 - p.risk_tolerance))

        # --- AI framing x novelty / hype allergy -----------------------------------
        if f.mentions_ai:
            add("AI angle vs novelty appetite", 0.14 * (p.novelty_seeking - 0.5) * 2)
            if p.skepticism > 0.65 and not f.has_proof:
                add("AI hype allergy", -0.08)

        # --- subscription friction ---------------------------------------------
        if f.mentions_subscription:
            add("subscription fatigue",
                -0.08 * (0.5 * p.price_sensitivity + 0.5 * (1.0 - p.risk_tolerance)))
            if f.mentions_lockin:
                add("lock-in terms", -0.05)

        # --- privacy & security -------------------------------------------------
        if p.privacy_sensitivity > 0.6:
            if f.mentions_security:
                add("security posture visible", 0.06 * p.privacy_sensitivity)
            elif f.mentions_privacy:
                add("data talk without guarantees", -0.08 * (p.privacy_sensitivity - 0.5))
            else:
                add("no security/privacy info", -0.10 * (p.privacy_sensitivity - 0.6))

        # --- brand trust prior (unknown vendor) -----------------------------------
        add("trust in unknown brands", (p.brand_trust - 0.5) * 0.12)

        # --- copy quality ---------------------------------------------------------
        add("copy clarity", (f.clarity_score - 0.5) * 0.10)
        if f.jargon_score > 0.3:
            add("jargon density", -f.jargon_score * 0.10 * (1.0 - 0.5 * p.novelty_seeking))

        # --- familiarity dynamics ---------------------------------------------
        if p.category_familiarity == "high":
            add("knows the alternatives", -0.05 * p.skepticism)
        elif p.category_familiarity == "low":
            add("category inertia", -0.04 * (1.0 - p.novelty_seeking))

        # --- switching inertia: the default action is always "do nothing" ------
        # Without this, a strong stimulus saturates the swarm green, which no
        # real market does. Novelty-seekers overcome inertia more easily.
        add("switching inertia", -(0.06 + 0.07 * (1.0 - p.novelty_seeking)))

        # --- individual noise (personality quirks the traits don't capture) ----
        add("personal quirk", rng.gauss(0, 0.09))

        return clamp(score, 0.02, 0.97), ledger, wtp_base

    # -------------------------------------------------------------- objections
    def _pick_objection(self, p: Persona, f: StimulusFeatures, score: float,
                        rng: random.Random) -> tuple[str, str]:
        db = set(p.dealbreakers)
        cands: list[tuple[str, float]] = []

        def has_db(*fragments: str) -> bool:
            return any(any(fr in d for d in db) for fr in fragments)

        if not f.has_pricing and has_db("pricing", "hidden fees"):
            cands.append(("pricing_unclear", 1.0 * p.price_sensitivity))
        if f.has_pricing and f.min_price:
            wtp = p.monthly_budget_usd * (0.25 + 0.55 * (1 - p.price_sensitivity))
            if f.min_price > wtp:
                cands.append(("price_too_high", 1.2 * p.price_sensitivity))
        if not f.has_proof:
            if has_db("proof"):
                cands.append(("no_proof", 1.0 * p.skepticism))
            if has_db("case studies"):
                cands.append(("no_case_studies", 0.9 * p.skepticism))
        if f.mentions_ai and not f.has_proof and (has_db("AI hype") or p.skepticism > 0.6):
            cands.append(("ai_hype", 0.9 * p.skepticism))
        if f.mentions_subscription and has_db("lock-in", "cancel"):
            cands.append(("subscription_lockin", 0.75 * (1.0 - p.risk_tolerance)))
        if not f.mentions_security and has_db("SSO", "compliance"):
            cands.append(("no_security_docs", 1.1 * p.privacy_sensitivity))
        if not f.mentions_security and has_db("data"):
            cands.append(("privacy_vague", 0.8 * p.privacy_sensitivity))
        if not f.has_free_trial and has_db("trial", "credit card"):
            cands.append(("no_trial", 0.8 * p.price_sensitivity))
        if has_db("onboarding", "time", "another tool"):
            cands.append(("onboarding_time", 0.55 * (1.0 - p.novelty_seeking)))
        if has_db("tools we already use"):
            cands.append(("integration", 0.6))
        if has_db("corporate") or (f.jargon_score > 0.4 and p.brand_trust < 0.45):
            cands.append(("credibility", 0.5 * (1.0 - p.brand_trust)))
        if not cands:
            cands.append(("generic_fit", 0.5))

        # weighted pick with individual noise — personas with identical traits
        # still don't all voice the same objection
        key = max(cands, key=lambda c: c[1] * (0.7 + 0.6 * rng.random()))[0]
        template = rng.choice(OBJECTION_TEMPLATES[key])
        text = template.replace("{price}", _fmt_price(f.min_price)) \
                       .replace("{anchor}", self._anchor(f, rng))
        # Happy personas still name their *closest* concern, phrased mildly.
        if score >= 0.62:
            text = rng.choice([
                f"only thing I'd check: {text}",
                f"minor worry — {text}",
                f"before paying I'd still ask: {text}",
            ])
        return key, text

    def _pick_positive(self, p: Persona, f: StimulusFeatures, score: float,
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
        if not pool or score < 0.18:
            key = "none"
        else:
            key = max(pool, key=lambda c: c[1] * (0.7 + 0.6 * rng.random()))[0]
        return rng.choice(POSITIVE_TEMPLATES[key]).replace("{anchor}", self._anchor(f, rng))

    # ----------------------------------------------------------------- pricing
    def _max_price(self, p: Persona, f: StimulusFeatures, score: float,
                   wtp_base: float, status: str, rng: random.Random) -> float:
        if status == "red" and rng.random() < 0.30 + 0.35 * p.price_sensitivity:
            return 0.0
        # Budget-derived ceiling, scaled by enthusiasm.
        ceiling = wtp_base * (0.45 + 0.75 * score)
        if f.has_pricing and f.min_price:
            # Price anchoring: once a price is on the table, stated WTP clusters
            # around it instead of drifting toward raw budget capacity. Price-
            # sensitive personas anchor BELOW sticker, relaxed ones above it.
            sensitivity_factor = 1.15 - 0.5 * p.price_sensitivity
            anchored = f.min_price * (0.5 + 1.3 * score) * sensitivity_factor
            wtp = min(ceiling, anchored)
        else:
            wtp = ceiling
        wtp *= rng.uniform(0.85, 1.15)
        return _round_price(max(0.0, wtp))

    # ------------------------------------------------------------------- text
    def _anchor(self, f: StimulusFeatures, rng: random.Random) -> str:
        pool = f.anchors[:6] or ([f.title] if f.title else ["this"])
        chosen = rng.choice(pool)
        # Product names read better title-cased ("MealPilot", not "mealpilot").
        if f.title and chosen.lower() == f.title.lower():
            return f.title
        return chosen

    # Openers/closers multiply quote-surface variety so 1,000 personas don't
    # exhaust the template space (matters for the verbatim-duplication metric
    # and for how human the live feed reads).
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

    def _reasoning(self, p: Persona, ledger: list[tuple[str, float]], status: str) -> str:
        """Short public rationale from the top scoring factors — this is a
        description of the actual computation, not a chain-of-thought."""
        top = sorted(ledger, key=lambda x: abs(x[1]), reverse=True)[:2]
        drivers = " + ".join(
            f"{label} ({'+' if delta >= 0 else ''}{delta:.2f})" for label, delta in top
        )
        verdict = {"green": "leaning in", "yellow": "needs convincing", "red": "walking away"}[status]
        return f"{drivers} → {verdict}."


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
