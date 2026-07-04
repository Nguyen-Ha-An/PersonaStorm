"""Category classifier + high-risk flag.

Maps a parsed stimulus (``StimulusFeatures``) to one of the 10 preset
categories defined in ``app.services.criteria.presets`` and flags
high-risk products (finance/medical/health/safety/childcare) that the
scorer's hard gate treats specially.
"""

from __future__ import annotations

import re

from ..stimulus_parser import StimulusFeatures
from .presets import CATEGORY_IDS

# The parser's own coarse category guess (see stimulus_parser._CATEGORY_KEYWORDS)
# maps fairly directly onto a subset of our 10 preset categories. This acts as
# a strong prior — if the parser already spotted "saas_b2b" tokens, we should
# not second-guess it without good reason.
_PRIOR_WEIGHT = 3.0

_AI_TOOL_WORDS = {"ai", "gpt", "llm", "copilot", "agent", "model", "genai", "ml"}

_KEYWORDS: dict[str, set[str]] = {
    "luxury_product": {
        "luxury", "premium", "exclusive", "handcrafted", "bespoke", "couture",
        "limited-edition", "limited", "artisan", "heritage",
    },
    "marketplace": {
        "marketplace", "sellers", "buyers", "vendors", "listings", "two-sided",
        "commission", "gig",
    },
    "social_product": {
        "social", "feed", "followers", "community", "posts", "viral", "share",
        "friends", "dm",
    },
    "hardware_product": {
        "hardware", "device", "sensor", "wearable", "chip", "battery",
        "firmware", "shipping", "gadget",
    },
    "ai_tool": _AI_TOOL_WORDS,
}

_HIGH_RISK_WORDS = {
    "bank", "payment", "pay", "invest", "loan", "credit", "insurance",
    "medical", "health", "patient", "diagnosis", "therapy", "clinical",
    "prescription", "child", "kids", "minor", "safety", "records",
}

# Maps the parser's coarse `features.category` guess to one of our 10
# preset categories. `devtool` is context-dependent (see below); `other`
# carries no prior at all.
_PARSER_CATEGORY_MAP: dict[str, str] = {
    "saas_b2b": "b2b_saas",
    "consumer_app": "consumer_app",
    "ecommerce": "ecommerce_product",
    "edtech": "education_product",
    "health_fitness": "consumer_app",
    "fintech": "b2b_saas",
}


def _keyword_hit(word: str, tokset: set[str], lower: str) -> bool:
    """True if ``word`` is present as a whole token, or as a word-boundary
    match in ``lower``.

    Uses ``\\b`` word-boundary matching (rather than raw substring search)
    so mid-word substrings don't false-positive — e.g. "ai" must not match
    inside "maintain" or "domain". Multi-word/hyphenated keywords like
    "money-back" or "two-sided" still match since the boundaries anchor on
    the full phrase, not on individual letters within a larger word.
    """
    return word in tokset or re.search(rf"\b{re.escape(word)}\b", lower) is not None


def _any_keyword_hit(words: set[str], tokset: set[str], lower: str) -> bool:
    """True if any keyword in ``words`` hits (see ``_keyword_hit``)."""
    return any(_keyword_hit(w, tokset, lower) for w in words)


def _count_keyword_hits(words: set[str], tokset: set[str], lower: str) -> int:
    """Count of keywords in ``words`` that hit (see ``_keyword_hit``)."""
    return sum(1 for w in words if _keyword_hit(w, tokset, lower))


def _prior_category(features: StimulusFeatures) -> str | None:
    cat = features.category
    if cat == "devtool":
        return "ai_tool" if features.mentions_ai else "b2b_saas"
    return _PARSER_CATEGORY_MAP.get(cat)


def classify_category(features: StimulusFeatures) -> tuple[str, float]:
    """Score all 10 preset categories and return the best match.

    Returns (category, confidence) where category is always a member of
    CATEGORY_IDS and confidence is in [0, 1]. Falls back to ("generic",
    low confidence) when there's no meaningful signal.
    """
    lower = features.raw.lower()
    tokset = set(features.tokens)
    scores: dict[str, float] = {cat: 0.0 for cat in CATEGORY_IDS if cat != "generic"}

    # Strong prior from the parser's own category guess.
    prior = _prior_category(features)
    if prior is not None and prior in scores:
        scores[prior] += _PRIOR_WEIGHT

    # AI signal boost — independent of the prior, since an AI devtool /
    # AI-powered SaaS product should lean toward ai_tool even if the parser
    # tagged it saas_b2b.
    if features.mentions_ai:
        scores["ai_tool"] += 1.5
    ai_hits = _count_keyword_hits(_AI_TOOL_WORDS, tokset, lower)
    scores["ai_tool"] += 0.5 * ai_hits

    # Keyword sets for categories the parser doesn't natively cover.
    for cat, words in _KEYWORDS.items():
        if cat == "ai_tool":
            continue  # handled above
        hits = _count_keyword_hits(words, tokset, lower)
        scores[cat] += hits

    total = sum(scores.values())
    if total <= 0:
        return "generic", 0.1

    best_cat = max(scores, key=lambda c: scores[c])
    best_score = scores[best_cat]
    if best_score <= 0:
        return "generic", 0.1

    confidence = min(1.0, best_score / total)
    return best_cat, confidence


def is_high_risk(features: StimulusFeatures) -> bool:
    """True if the stimulus touches finance/medical/health/safety/childcare."""
    lower = features.raw.lower()
    tokset = set(features.tokens)
    return _any_keyword_hit(_HIGH_RISK_WORDS, tokset, lower)
