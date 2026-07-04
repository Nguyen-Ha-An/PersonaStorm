"""Persona Diversity Validator — guards against a degenerate persona space.

If all personas are near-identical, swarm output is worthless no matter how
good the reaction model is (garbage-in collapse). This runs BEFORE inference,
which is cheaper than detecting collapse after 1,000 generations.

Checks:
1. Trait spread    — every behavioral trait must have stddev >= MIN_TRAIT_STD.
2. Coverage        — every declared sub-segment must actually appear (>= ~3%).
3. Dealbreaker mix — enough distinct dealbreaker combinations.
4. Age spread      — population isn't a single age.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from ...schemas.persona import Persona
from ...utils.text import stddev

MIN_TRAIT_STD = 0.07
MIN_DEALBREAKER_UNIQUENESS = 0.30

TRAITS = ["price_sensitivity", "skepticism", "novelty_seeking", "brand_trust",
          "social_influence", "risk_tolerance", "privacy_sensitivity"]


@dataclass
class DiversityReport:
    ok: bool
    trait_std: dict[str, float] = field(default_factory=dict)
    sub_segment_counts: dict[str, int] = field(default_factory=dict)
    dealbreaker_uniqueness: float = 0.0
    age_std: float = 0.0
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "trait_std": {k: round(v, 3) for k, v in self.trait_std.items()},
            "sub_segment_counts": self.sub_segment_counts,
            "dealbreaker_uniqueness": round(self.dealbreaker_uniqueness, 3),
            "age_std": round(self.age_std, 2),
            "warnings": self.warnings,
        }


def validate_diversity(personas: list[Persona],
                       expected_sub_segments: list[str]) -> DiversityReport:
    warnings: list[str] = []
    n = len(personas)
    if n == 0:
        return DiversityReport(ok=False, warnings=["no personas generated"])

    trait_std = {t: stddev([getattr(p, t) for p in personas]) for t in TRAITS}
    for t, s in trait_std.items():
        if s < MIN_TRAIT_STD:
            warnings.append(f"trait '{t}' spread too low (std={s:.3f} < {MIN_TRAIT_STD})")

    seg_counts = Counter(p.sub_segment for p in personas)
    min_share = 0.03 if n >= 200 else 0.01
    for seg in expected_sub_segments:
        if seg_counts.get(seg, 0) < max(1, int(n * min_share)):
            warnings.append(f"sub-segment '{seg}' underrepresented")

    combos = {tuple(sorted(p.dealbreakers)) for p in personas}
    uniqueness = len(combos) / n
    if n >= 100 and uniqueness < MIN_DEALBREAKER_UNIQUENESS:
        warnings.append(
            f"dealbreaker combination uniqueness low ({uniqueness:.2f} < {MIN_DEALBREAKER_UNIQUENESS})"
        )

    # Age threshold is RELATIVE to the market's natural span: "SEA Gen Z" is
    # legitimately 18-27, so demanding a wide absolute spread would be wrong.
    ages = [float(p.age) for p in personas]
    age_std = stddev(ages)
    span = max(ages) - min(ages)
    min_age_std = max(1.5, span / 8.0)
    if age_std < min_age_std:
        warnings.append(f"age spread low (std={age_std:.1f} < {min_age_std:.1f} for span {span:.0f})")

    return DiversityReport(
        ok=len(warnings) == 0,
        trait_std=trait_std,
        sub_segment_counts=dict(seg_counts),
        dealbreaker_uniqueness=uniqueness,
        age_std=age_std,
        warnings=warnings,
    )
