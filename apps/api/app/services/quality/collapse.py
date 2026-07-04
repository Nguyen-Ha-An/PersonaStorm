"""Collapse Detector — live, in-flight mode-collapse monitoring.

The full quality computation runs once at the end; this monitor runs DURING
the storm over a sliding window so the UI can show "collapse risk" while
reactions stream in. If a future real model starts emitting near-identical
outputs (classic LLM failure under repetitive prompting), the dashboard shows
it within ~200 reactions instead of after all 1,000.
"""

from __future__ import annotations

from collections import Counter, deque

from ...schemas.reaction import PersonaReaction
from ...utils.text import clamp, normalize_objection, shannon_entropy_norm


class RunningCollapseMonitor:
    def __init__(self, window: int = 200):
        self._objections: deque[str] = deque(maxlen=window)  # themes -> entropy
        self._quotes: deque[str] = deque(maxlen=window)      # verbatim -> duplication
        self._likelihood_bins: deque[int] = deque(maxlen=window)

    def update(self, reaction: PersonaReaction) -> None:
        self._objections.append(normalize_objection(reaction.first_objection))
        self._quotes.append(normalize_objection(reaction.quote))
        self._likelihood_bins.append(min(9, int(reaction.buy_likelihood * 10)))

    @property
    def score(self) -> float:
        n = len(self._objections)
        if n < 20:
            return 0.0  # not enough signal yet
        # Same shape as the final metric (see metrics.py): theme convergence is
        # signal, verbatim duplication is collapse.
        dup = 1.0 - len(set(self._quotes)) / n
        entropy = shannon_entropy_norm(list(Counter(self._objections).values()))
        bin_counts = Counter(self._likelihood_bins)
        concentration = clamp((max(bin_counts.values()) / n - 0.15) / 0.85)
        return clamp(0.35 * dup + 0.35 * (1.0 - entropy) + 0.30 * concentration)

    @property
    def level(self) -> str:
        s = self.score
        return "low" if s < 0.33 else "medium" if s < 0.60 else "high"
