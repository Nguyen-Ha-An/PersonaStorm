"""Persona Space Builder — samples N structured personas from a preset.

Design decisions:
- Seeded RNG end-to-end (`random.Random(seed_string)`) so a demo run is exactly
  reproducible on stage. The seed combines run seed + preset + count.
- Traits are sampled from per-sub-segment Gaussians and clipped to [0.02, 0.98],
  so populations have realistic spread instead of identical archetypes.
- Dealbreakers get a trait-consistency pass: a persona with price_sensitivity
  0.9 always carries a pricing-related dealbreaker. This keeps the persona
  internally coherent, which is what makes persona-adherence measurable later.
"""

from __future__ import annotations

import random

from ...schemas.persona import DecisionContext, Persona
from ..criteria.age_overlays import life_stage_for
from .diversity import validate_diversity
from .presets import DB, PresetSpec, SubSegmentSpec, resolve_preset

_PRICING_DEALBREAKERS = {"unclear pricing", "hidden fees", "requires credit card upfront"}
_PRIVACY_DEALBREAKERS = {"vague about what happens to my data",
                         "compliance posture unknown (SOC2/GDPR)"}

# Real people carry idiosyncratic dealbreakers from outside their segment's
# core profile (an enterprise buyer who is also a parent, a student who got
# burned by hidden fees). 35% of personas draw ONE extra from the global
# vocabulary — adds realism and multiplies dealbreaker-combination space,
# which the diversity validator checks.
_GLOBAL_EXTRA_RATE = 0.35
_GLOBAL_EXTRAS = list(DB.values())


class PersonaGenerator:
    def __init__(self, seed: int = 1337):
        self.seed = seed

    def generate(
        self,
        preset_key: str,
        count: int,
        custom_description: str | None = None,
        max_retries: int = 2,
    ) -> tuple[list[Persona], "DiversityReportLike"]:
        """Generate personas + diversity report. Retries with a jittered seed if
        the population fails diversity validation (rare with current presets)."""
        preset = resolve_preset(preset_key, custom_description)
        attempt = 0
        while True:
            rng = random.Random(f"{self.seed + attempt}:{preset.key}:{count}")
            personas = self._sample(preset, count, rng)
            report = validate_diversity(personas, [s.name for s in preset.sub_segments])
            if report.ok or attempt >= max_retries:
                return personas, report
            attempt += 1  # jitter the seed and resample

    # ------------------------------------------------------------------ sampling
    def _sample(self, preset: PresetSpec, count: int, rng: random.Random) -> list[Persona]:
        allocations = _allocate(count, [s.weight for s in preset.sub_segments])
        personas: list[Persona] = []
        idx = 0
        for sub, n in zip(preset.sub_segments, allocations):
            for _ in range(n):
                idx += 1
                personas.append(self._one(preset, sub, idx, rng))
        rng.shuffle(personas)  # interleave sub-segments so the live grid mixes colors
        return personas

    def _one(self, preset: PresetSpec, sub: SubSegmentSpec, idx: int,
             rng: random.Random) -> Persona:
        traits = {
            name: _clip(rng.gauss(mean, std))
            for name, (mean, std) in sub.traits.items()
        }
        band_label, (lo, hi) = rng.choice(sub.income_bands)
        budget = round(rng.uniform(lo, hi), 2)

        dealbreakers = rng.sample(sub.dealbreaker_pool,
                                  k=min(len(sub.dealbreaker_pool), rng.randint(3, 5)))
        if rng.random() < _GLOBAL_EXTRA_RATE:
            extra = rng.choice(_GLOBAL_EXTRAS)
            if extra not in dealbreakers:
                dealbreakers.append(extra)
        # Trait-consistency pass (see module docstring)
        if traits["price_sensitivity"] > 0.72 and not (set(dealbreakers) & _PRICING_DEALBREAKERS):
            pool_pricing = [d for d in sub.dealbreaker_pool if d in _PRICING_DEALBREAKERS]
            dealbreakers[-1] = pool_pricing[0] if pool_pricing else "unclear pricing"
        if traits["privacy_sensitivity"] > 0.75 and not (set(dealbreakers) & _PRIVACY_DEALBREAKERS):
            dealbreakers.append("vague about what happens to my data")

        age = rng.randint(*sub.age_range)
        life_stage = life_stage_for(age)
        decision_context = self._decision_context(preset, sub, life_stage, rng)

        return Persona(
            persona_id=f"{preset.id_prefix}_{idx:04d}",
            preset=preset.key,
            segment=sub.name,
            sub_segment=sub.name,
            age=age,
            region=rng.choice(sub.regions),
            income_band=band_label,
            occupation=rng.choice(sub.occupations),
            category_familiarity=rng.choice(sub.familiarity),  # weighted via repeats
            research_style=rng.choice(sub.research_styles),
            buying_trigger=rng.choice(sub.buying_triggers),
            dealbreakers=list(dict.fromkeys(dealbreakers)),  # dedupe, keep order
            monthly_budget_usd=budget,
            decision_context=decision_context,
            **traits,
        )

    # ------------------------------------------------------ decision context
    def _decision_context(self, preset: PresetSpec, sub: SubSegmentSpec,
                           life_stage: str, rng: random.Random) -> DecisionContext:
        """Build a deterministic (seeded) DecisionContext from life stage +
        preset/sub-segment shape. Teens get the parent-approval-shaped
        fields; other stages get reasonable, still-seeded defaults."""
        if life_stage == "teen_student":
            return DecisionContext(
                needs_parent_approval=True,
                budget_control="allowance",
                risk_owner="parent",
                attention_span="short",
                main_influence_sources=list(
                    rng.sample(["peers", "creators", "school"], k=3)
                ),
                school_context=rng.choice([
                    "in school, homework-heavy schedule",
                    "in school, active in clubs/extracurriculars",
                    "in school, prepping for exams",
                ]),
                decision_horizon="days",
            )

        if life_stage == "student_young_adult":
            return DecisionContext(
                needs_parent_approval=False,
                budget_control=rng.choice(["self", "shared with roommates"]),
                risk_owner="self",
                attention_span=rng.choice(["short", "medium"]),
                main_influence_sources=list(
                    rng.sample(["peers", "creators", "online reviews"], k=2)
                ),
                decision_horizon=rng.choice(["days", "weeks"]),
            )

        if life_stage == "parent_family":
            return DecisionContext(
                needs_parent_approval=False,
                budget_control=rng.choice(["household budget", "self"]),
                risk_owner=rng.choice(["self", "shared with spouse"]),
                attention_span="medium",
                main_influence_sources=list(
                    rng.sample(["other parents", "online reviews", "school"], k=2)
                ),
                decision_horizon=rng.choice(["weeks", "months"]),
            )

        # early_career / established_adult / older_adult / anything else.
        return DecisionContext(
            needs_parent_approval=False,
            budget_control=rng.choice(["self", "employer/expense", "household budget"]),
            risk_owner="self",
            attention_span=rng.choice(["medium", "long"]),
            main_influence_sources=list(
                rng.sample(["colleagues", "online reviews", "industry blogs"], k=2)
            ),
            decision_horizon=rng.choice(["weeks", "months", "quarter"]),
        )


def _allocate(total: int, weights: list[float]) -> list[int]:
    """Largest-remainder allocation so counts sum exactly to `total`."""
    s = sum(weights)
    raw = [total * w / s for w in weights]
    counts = [int(r) for r in raw]
    remainder = total - sum(counts)
    fracs = sorted(range(len(raw)), key=lambda i: raw[i] - counts[i], reverse=True)
    for i in range(remainder):
        counts[fracs[i % len(fracs)]] += 1
    return counts


def _clip(v: float) -> float:
    return round(max(0.02, min(0.98, v)), 3)


# typing helper for the tuple return without importing the class at module top
DiversityReportLike = object
