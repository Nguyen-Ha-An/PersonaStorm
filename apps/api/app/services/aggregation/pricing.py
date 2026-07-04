"""Price sensitivity curve — share of the swarm willing to pay at each price.

Classic Gabor-Granger shape: for each candidate price p, the share of personas
whose stated max_price >= p. If the stimulus contains real prices, the grid
brackets them (so the chart shows exactly where the pasted price sits on the
demand curve); otherwise the grid derives from the swarm's WTP distribution.
"""

from __future__ import annotations

from ...schemas.reaction import PersonaReaction
from ...schemas.report import PricePoint
from ..stimulus_parser import StimulusFeatures

_ANCHOR_MULTIPLIERS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]


def build_price_curve(reactions: list[PersonaReaction],
                      features: StimulusFeatures) -> list[PricePoint]:
    if not reactions:
        return []
    wtps = sorted(r.max_price for r in reactions)
    n = len(wtps)

    if features.has_pricing and features.min_price:
        grid = sorted({_nice(features.min_price * m) for m in _ANCHOR_MULTIPLIERS})
    else:
        # percentile-based grid over observed positive WTP
        positive = [w for w in wtps if w > 0] or [1.0]
        qs = [0.05, 0.20, 0.35, 0.50, 0.65, 0.80, 0.92, 0.99]
        grid = sorted({_nice(positive[min(len(positive) - 1, int(q * len(positive)))]) for q in qs})

    curve = []
    for price in grid:
        if price <= 0:
            continue
        willing = sum(1 for w in wtps if w >= price)
        curve.append(PricePoint(price=price, share_willing=round(willing / n, 4)))
    return curve


def average_wtp(reactions: list[PersonaReaction]) -> float:
    """Mean stated max_price across ALL personas — zeros included on purpose.
    Rejectors' $0 is real signal; excluding them would inflate the number."""
    if not reactions:
        return 0.0
    return round(sum(r.max_price for r in reactions) / len(reactions), 2)


def _nice(v: float) -> float:
    if v < 1:
        return round(v, 2)
    if v < 20:
        return round(v * 2) / 2
    if v < 100:
        return float(round(v))
    return float(round(v / 5) * 5)
