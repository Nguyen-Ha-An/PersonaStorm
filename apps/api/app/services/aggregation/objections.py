"""Objection clustering — turns 1,000 free-text objections into ranked themes.

P0 approach: normalize -> exact-key grouping -> greedy token-Jaccard merge.
No embeddings needed locally, deterministic, and O(k^2) only over distinct
keys (small). The inference roadmap swaps this for embedding clustering +
Gemma-27B cluster labeling via the analyst agent.
"""

from __future__ import annotations

from collections import Counter

from ...schemas.reaction import PersonaReaction
from ...schemas.report import ObjectionCluster
from ...utils.text import jaccard, normalize_objection

# Mild prefixes the mock adds for green personas — strip so "minor worry — no
# proof" clusters with "no proof".
_SOFT_PREFIXES = ("only thing i'd check:", "minor worry —", "minor worry -",
                  "before paying i'd still ask:")

# Theme lexicon: different phrasings of the same underlying concern must land
# in ONE cluster ("never says what happens to my data" == "vague on data
# handling"). Order = tie-break priority (more specific themes first).
# Roadmap: replaced by embedding clustering + analyst-agent labeling.
_THEMES: list[tuple[str, set[str]]] = [
    ("security & compliance", {"soc2", "sso", "compliance", "procurement", "security",
                               "pen-test", "audit", "documentation"}),
    ("data privacy", {"data", "privacy", "info", "personal", "handling", "feeding",
                      "private", "stance"}),
    ("free trial & try-before-buy", {"trial", "trying", "test", "paying-first"}),
    ("subscription & lock-in", {"subscription", "subscriptions", "monthly", "billing",
                                "cancel", "recurring", "trap", "lock-in"}),
    ("proof & evidence", {"proof", "evidence", "case", "studies", "study", "numbers",
                          "results", "claims", "adjectives", "prove", "proves",
                          "reference", "manually"}),
    ("AI hype skepticism", {"ai", "ai-powered", "hype", "capability", "bolted",
                            "framing"}),
    ("pricing & affordability", {"price", "pricing", "cost", "costs", "expensive",
                                 "afford", "fees", "budget", "tag", "hidden"}),
    ("setup time & complexity", {"setup", "onboarding", "learn", "migration",
                                 "hours", "system", "buried"}),
    ("integration fit", {"plugs", "stack", "integrate", "integration", "tools",
                         "disconnected"}),
    ("trust & credibility", {"trust", "corporate", "salesy", "oversells", "heard"}),
    ("audience fit", {"solves", "problem", "pitch", "obvious"}),
]


def _clean(text: str) -> str:
    low = text.lower().strip()
    for p in _SOFT_PREFIXES:
        if low.startswith(p):
            return low[len(p):].strip()
    return low


def _theme_of(tokens: set[str]) -> str | None:
    best, best_hits = None, 0
    for name, vocab in _THEMES:
        hits = len(tokens & vocab)
        if hits > best_hits:  # strict > keeps earlier (higher-priority) themes on ties
            best, best_hits = name, hits
    return best


def cluster_objections(reactions: list[PersonaReaction], top_k: int = 8,
                       merge_threshold: float = 0.5) -> list[ObjectionCluster]:
    total = len(reactions) or 1

    # 1) exact grouping on normalized keys
    groups: dict[str, list[PersonaReaction]] = {}
    for r in reactions:
        if not r.first_objection.strip():
            continue
        key = normalize_objection(_clean(r.first_objection))
        groups.setdefault(key, []).append(r)

    # 2a) theme-first merge; 2b) Jaccard fallback for un-themed keys
    themed: dict[str, list[PersonaReaction]] = {}
    merged: list[tuple[set[str], list[PersonaReaction]]] = []
    for key, members in sorted(groups.items(), key=lambda kv: len(kv[1]), reverse=True):
        tokens = set(key.split())
        theme = _theme_of(tokens)
        if theme is not None:
            themed.setdefault(theme, []).extend(members)
            continue
        for existing_tokens, existing_members in merged:
            if jaccard(tokens, existing_tokens) >= merge_threshold:
                existing_members.extend(members)
                existing_tokens |= tokens
                break
        else:
            merged.append((tokens, members))
    merged.extend((set(), members) for members in themed.values())

    # 3) build clusters
    clusters: list[ObjectionCluster] = []
    for _, members in sorted(merged, key=lambda m: len(m[1]), reverse=True)[:top_k]:
        phrasings = Counter(_clean(m.first_objection) for m in members)
        label = phrasings.most_common(1)[0][0]
        # prefer a quote from an actual detractor as the example
        detractors = [m for m in members if m.status in ("red", "yellow")]
        example = (detractors[0] if detractors else members[0]).quote
        seg_counts = Counter(m.segment for m in members if m.segment)
        clusters.append(ObjectionCluster(
            label=label,
            count=len(members),
            share=round(len(members) / total, 4),
            example_quote=example,
            top_segments=[s for s, _ in seg_counts.most_common(2)],
        ))
    return clusters
