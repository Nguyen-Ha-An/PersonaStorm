"""Tokenizer + parser tests for hyphenated compounds.

Regression for the shared ``WORD_RE`` bug: it allowed ``-`` inside a token, so
"AI-powered" collapsed into the single token "ai-powered" and never matched the
"ai" entry in ``_AI_WORDS`` — leaving ``mentions_ai`` silently False for that
(very common) phrasing. The tokenizer now also emits the hyphen-split word parts
while keeping the full compound, so both component matching ("ai") and
compound/multi-word keyword matching ("money-back", "soc-2", "lock-in") work.
"""

from app.services.stimulus_parser import parse_stimulus
from app.utils.text import tokenize


def test_tokenize_splits_hyphenated_word_into_parts():
    toks = tokenize("AI-powered")
    assert "ai" in toks
    assert "powered" in toks


def test_tokenize_keeps_hyphenated_compound():
    # Multi-word keywords like "money-back" / "soc-2" match by set intersection,
    # so the full compound must survive alongside its parts.
    toks = tokenize("money-back soc-2 lock-in")
    assert "money-back" in toks
    assert "soc-2" in toks
    assert "lock-in" in toks


def test_tokenize_drops_numeric_only_parts():
    # "soc-2" -> "soc" is a valid part, but "2" has no leading letter and is
    # dropped (mirrors WORD_RE's letter-initial requirement).
    toks = tokenize("soc-2")
    assert "soc" in toks
    assert "2" not in toks


def test_mentions_ai_true_for_ai_powered():
    f = parse_stimulus("An AI-powered assistant for teams.", "X", "product_concept")
    assert f.mentions_ai is True


def test_mentions_ai_true_for_ai_driven():
    f = parse_stimulus("An AI-driven analytics dashboard.", "X", "product_concept")
    assert f.mentions_ai is True


def test_hyphenated_compounds_still_flag_their_signals():
    # Dual-emission must not break flags keyed on hyphenated compounds. The
    # stimulus deliberately avoids other members of these sets so each flag can
    # only be True via its compound ("soc-2", "lock-in", "money-back").
    f = parse_stimulus(
        "Enterprise plan with SOC-2 certification and no lock-in. 30-day money-back offer.",
        "X",
        "product_concept",
    )
    assert f.mentions_security is True  # via "soc-2"
    assert f.mentions_lockin is True    # via "lock-in"
    assert f.has_proof is True          # via "money-back"


def test_no_false_ai_from_substring():
    # "maintain"/"domain" contain the letters "ai" but must not tokenize to "ai".
    f = parse_stimulus("Maintain your domain names with our dashboard.", "X", "product_concept")
    assert f.mentions_ai is False
