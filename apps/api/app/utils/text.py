"""Small text/statistics utilities shared by the mock provider, quality
metrics, and aggregation. No heavy NLP deps on purpose — P0 must run anywhere.
"""

from __future__ import annotations

import math
import re
from collections import Counter

_WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9'-]+")

# Minimal English stopword list — enough to find salient product tokens.
STOPWORDS: set[str] = {
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "to",
    "of", "in", "on", "at", "by", "with", "from", "as", "is", "are", "was",
    "were", "be", "been", "being", "it", "its", "this", "that", "these",
    "those", "you", "your", "yours", "we", "our", "ours", "they", "their",
    "i", "me", "my", "he", "she", "his", "her", "them", "us", "will", "would",
    "can", "could", "should", "shall", "may", "might", "must", "do", "does",
    "did", "done", "have", "has", "had", "not", "no", "yes", "so", "than",
    "too", "very", "just", "about", "into", "over", "under", "after",
    "before", "between", "out", "up", "down", "off", "all", "any", "each",
    "more", "most", "some", "such", "only", "own", "same", "other", "get",
    "got", "make", "makes", "made", "like", "also", "per", "via", "how",
    "what", "when", "where", "which", "who", "why", "new", "one", "two",
    "use", "using", "used", "now", "here", "there", "every",
}

# Generic marketing words that don't count as product grounding.
GENERIC_MARKETING: set[str] = {
    "product", "solution", "platform", "tool", "app", "service", "innovative",
    "amazing", "great", "best", "better", "powerful", "seamless", "easy",
    "simple", "fast", "smart", "modern", "next-generation", "revolutionary",
    "world-class", "cutting-edge", "game-changing", "useful", "interesting",
}


def tokenize(text: str) -> list[str]:
    return [w.lower() for w in _WORD_RE.findall(text)]


def salient_tokens(text: str, top_n: int = 24) -> list[str]:
    """Most frequent non-stopword, non-generic tokens — the 'anchors' a grounded
    reaction should reference."""
    counts = Counter(
        t for t in tokenize(text)
        if len(t) > 3 and t not in STOPWORDS and t not in GENERIC_MARKETING
    )
    return [t for t, _ in counts.most_common(top_n)]


def normalize_objection(text: str) -> str:
    """Canonical key for near-duplicate objection detection: lowercase, strip
    punctuation/stopwords, sort tokens. 'Pricing is unclear' == 'unclear pricing'."""
    toks = sorted(t for t in tokenize(text) if t not in STOPWORDS)
    return " ".join(toks)


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    return len(a & b) / max(1, len(a | b))


def shannon_entropy_norm(counts: list[int]) -> float:
    """Shannon entropy of a distribution, normalized to [0,1] by log(k).
    1.0 = perfectly diverse, 0.0 = everything identical."""
    total = sum(counts)
    k = len([c for c in counts if c > 0])
    if total == 0 or k <= 1:
        return 0.0
    h = -sum((c / total) * math.log(c / total) for c in counts if c > 0)
    return h / math.log(k)


def rank_correlation(xs: list[float], ys: list[float]) -> float:
    """Spearman rank correlation (no scipy). Returns 0.0 for degenerate input."""
    n = len(xs)
    if n < 3 or len(ys) != n:
        return 0.0

    def ranks(vals: list[float]) -> list[float]:
        order = sorted(range(n), key=lambda i: vals[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r

    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    dx = math.sqrt(sum((v - mx) ** 2 for v in rx))
    dy = math.sqrt(sum((v - my) ** 2 for v in ry))
    if dx == 0 or dy == 0:
        return 0.0
    return num / (dx * dy)


def stddev(vals: list[float]) -> float:
    n = len(vals)
    if n < 2:
        return 0.0
    m = sum(vals) / n
    return math.sqrt(sum((v - m) ** 2 for v in vals) / (n - 1))


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))
