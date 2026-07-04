"""Input Parser — first box in the architecture.

Turns raw pasted text (product concept / landing page / ad / pricing table)
into StimulusFeatures: prices, proof signals, risk signals, salient tokens and
a category guess. Both the mock reaction engine and the quality metrics consume
these features, and real LLM providers receive them as structured context, so
this module stays useful after the mock is retired.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..utils.text import salient_tokens, tokenize

_PRICE_RE = re.compile(
    r"(?:(?:\$|usd\s?|€|£)\s?(\d{1,6}(?:[.,]\d{1,2})?))|(?:(\d{1,6}(?:[.,]\d{1,2})?)\s?(?:usd|\$|/mo|/month|per month|per user|/user|/seat|per seat))",
    re.IGNORECASE,
)

_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "saas_b2b": ["saas", "crm", "workflow", "dashboard", "integration", "api",
                 "analytics", "automation", "team", "workspace", "sso", "seat"],
    "consumer_app": ["app", "mobile", "download", "social", "photo", "video",
                     "streak", "friends", "feed", "ios", "android"],
    "ecommerce": ["shipping", "checkout", "cart", "store", "order", "delivery",
                  "marketplace", "returns", "discount"],
    "fintech": ["payment", "wallet", "bank", "invest", "loan", "credit",
                "crypto", "invoice", "payout", "remittance"],
    "edtech": ["course", "learn", "tutor", "exam", "study", "students",
               "lesson", "certification", "ielts", "toeic"],
    "health_fitness": ["fitness", "workout", "health", "sleep", "calories",
                       "meditation", "therapy", "wellness"],
    "devtool": ["developer", "sdk", "cli", "deploy", "code", "repo", "docker",
                "kubernetes", "observability", "gpu", "inference"],
}

_AI_WORDS = {"ai", "gpt", "llm", "ml", "model", "copilot", "agent", "genai",
             "machine", "neural", "automated", "automation"}
_PROOF_WORDS = {"testimonial", "case", "study", "customers", "reviews", "rated",
                "trusted", "results", "guarantee", "refund", "money-back",
                "benchmark", "proven", "roi", "%"}
_TRIAL_WORDS = {"trial", "free", "freemium", "demo", "sandbox"}
_SUBSCRIPTION_WORDS = {"subscription", "monthly", "yearly", "annual", "/mo",
                       "recurring", "plan", "tier", "billed"}
_PRIVACY_WORDS = {"privacy", "data", "gdpr", "encrypted", "encryption",
                  "tracking", "personal", "anonymous"}
_SECURITY_WORDS = {"soc2", "soc-2", "iso27001", "sso", "saml", "compliance",
                   "audit", "security", "hipaa"}
_LOCKIN_WORDS = {"contract", "commitment", "lock-in", "annual", "cancel",
                 "minimum"}


@dataclass
class StimulusFeatures:
    raw: str
    title: str
    stimulus_type: str
    tokens: list[str] = field(default_factory=list)
    anchors: list[str] = field(default_factory=list)  # salient product tokens
    prices: list[float] = field(default_factory=list)
    min_price: float | None = None
    max_price: float | None = None
    has_pricing: bool = False
    has_free_trial: bool = False
    has_proof: bool = False
    has_guarantee: bool = False
    mentions_ai: bool = False
    mentions_subscription: bool = False
    mentions_privacy: bool = False
    mentions_security: bool = False
    mentions_lockin: bool = False
    jargon_score: float = 0.0   # 0 = plain language, 1 = buzzword soup
    clarity_score: float = 0.5  # crude readability proxy
    category: str = "other"

    def anchor_set(self) -> set[str]:
        return set(self.anchors)


def parse_stimulus(raw: str, title: str, stimulus_type: str) -> StimulusFeatures:
    text = raw.strip()
    toks = tokenize(text)
    tokset = set(toks)
    f = StimulusFeatures(raw=text, title=title, stimulus_type=stimulus_type)
    f.tokens = toks
    f.anchors = salient_tokens(text)
    # Title words are anchors too — reactions naming the product count as grounded.
    f.anchors.extend(t for t in tokenize(title) if len(t) > 2 and t not in f.anchors)

    # --- prices ---------------------------------------------------------------
    for m in _PRICE_RE.finditer(text):
        val = m.group(1) or m.group(2)
        if val:
            try:
                price = float(val.replace(",", ""))
                if 0 < price < 1_000_000:
                    f.prices.append(price)
            except ValueError:
                pass
    if f.prices:
        f.has_pricing = True
        f.min_price = min(f.prices)
        f.max_price = max(f.prices)

    # --- signal flags -----------------------------------------------------------
    lower = text.lower()
    f.has_free_trial = bool(tokset & _TRIAL_WORDS)
    # Proof = proof vocabulary, percentage claims, or numeric social proof
    # ("1,200 stores", "used by 4,000 families") — skeptical personas key on this.
    f.has_proof = (
        bool(tokset & _PROOF_WORDS)
        or bool(re.search(r"\d{2,}\s?[%+]", text))
        or bool(re.search(
            r"\b\d[\d,.]*k?\s+(?:users|customers|teams|families|stores|companies|"
            r"businesses|agencies|schools|developers|sellers|clients|members)\b",
            text, re.IGNORECASE))
    )
    f.has_guarantee = "guarantee" in lower or "money-back" in lower or "refund" in lower
    f.mentions_ai = bool(tokset & _AI_WORDS)
    f.mentions_subscription = bool(tokset & _SUBSCRIPTION_WORDS) or "/mo" in lower
    f.mentions_privacy = bool(tokset & _PRIVACY_WORDS)
    f.mentions_security = bool(tokset & _SECURITY_WORDS)
    f.mentions_lockin = bool(tokset & _LOCKIN_WORDS)

    # --- jargon & clarity -------------------------------------------------------
    if toks:
        buzz = sum(1 for t in toks if t in _AI_WORDS or len(t) >= 12)
        f.jargon_score = min(1.0, buzz / max(20, len(toks)) * 6)
    sentences = [s for s in re.split(r"[.!?\n]+", text) if s.strip()]
    if sentences:
        avg_len = sum(len(tokenize(s)) for s in sentences) / len(sentences)
        # ~12-18 words/sentence reads well; long sentences hurt clarity
        f.clarity_score = max(0.0, min(1.0, 1.25 - abs(avg_len - 15) / 25))

    # --- category guess -----------------------------------------------------------
    best_cat, best_hits = "other", 0
    for cat, words in _CATEGORY_KEYWORDS.items():
        hits = sum(1 for w in words if w in tokset)
        if hits > best_hits:
            best_cat, best_hits = cat, hits
    if best_hits >= 2:
        f.category = best_cat
    return f
