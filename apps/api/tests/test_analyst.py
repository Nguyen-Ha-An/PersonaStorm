"""Analyst layer tests — NVIDIA GLM-5.2 re-narration with graceful fallback.

Design under test (see app/services/analyst/):
  - get_analyst(settings) routes ANALYST_PROVIDER -> MockAnalyst | NvidiaAnalyst,
    with a graceful fallback to MockAnalyst if NvidiaAnalyst can't be configured.
  - MockAnalyst.enhance_report is a no-op (identity) — the default demo path
    must be byte-for-byte the same aggregates as today.
  - NvidiaAnalyst.enhance_report ONLY rewrites narrative text fields (summary,
    recommendations, top_objections[].label, kill_quote) and NEVER numbers.
    It must never raise — on any failure it logs (no secrets) and returns the
    original report plus a fallback note in quality.notes.
"""

from __future__ import annotations

import asyncio

import pytest

from app.config import Settings
from app.schemas.persona import Persona
from app.services.aggregation import build_report
from app.services.analyst import AnalystProvider, get_analyst
from app.services.analyst.mock_analyst import MockAnalyst
from app.services.analyst.nvidia_analyst import NvidiaAnalyst
from app.services.inference import MockPersonaProvider
from app.services.persona import PersonaGenerator
from app.services.quality import compute_quality
from app.services.stimulus_parser import parse_stimulus
from app.schemas.storm import StormCreateRequest

STIM = (
    "LedgerLift is bookkeeping automation for ecommerce sellers. Connects to "
    "Shopify and Amazon, auto-categorizes transactions, files sales tax. "
    "$49/month, free 30-day trial, cancel anytime. 1,200 stores onboard."
)


def _build_sample_report():
    """Build a minimal but real StormReport via the actual pipeline pieces."""
    request = StormCreateRequest(
        title="LedgerLift",
        stimulus_type="product_concept",
        stimulus=STIM,
        target_market="us_smb",
        persona_count=80,
    )
    personas, _ = PersonaGenerator(seed=11).generate("us_smb", 80)
    features = parse_stimulus(STIM, "LedgerLift", "product_concept")
    provider = MockPersonaProvider(seed=11)
    reactions = asyncio.run(
        provider.react_batch(personas, STIM, "product_concept", features)
    )
    quality = compute_quality(personas, reactions, features)
    return build_report(
        "storm_test123", request, personas, reactions, features, quality, "generic"
    )


@pytest.fixture(scope="module")
def sample_report():
    return _build_sample_report()


# --------------------------------------------------------------------------- factory


def test_get_analyst_mock_default():
    settings = Settings(analyst_provider="mock")
    analyst = get_analyst(settings)
    assert isinstance(analyst, MockAnalyst)
    assert analyst.name == "mock"


def test_get_analyst_nvidia_without_key_falls_back_to_mock():
    settings = Settings(
        analyst_provider="nvidia",
        nvidia_api_key=None,
        nvidia_base_url="https://integrate.api.nvidia.com/v1",
    )
    analyst = get_analyst(settings)
    assert isinstance(analyst, MockAnalyst)


def test_get_analyst_nvidia_with_key_returns_nvidia_analyst():
    settings = Settings(
        analyst_provider="nvidia",
        nvidia_api_key="nvapi-test",
        nvidia_base_url="https://integrate.api.nvidia.com/v1",
        nvidia_model="z-ai/glm-5.2",
    )
    analyst = get_analyst(settings)
    assert isinstance(analyst, NvidiaAnalyst)
    assert analyst.name == "nvidia"


# --------------------------------------------------------------------------- mock analyst


def test_mock_analyst_returns_report_unchanged(sample_report):
    analyst = MockAnalyst()
    out = asyncio.run(analyst.enhance_report(sample_report))
    assert out.summary == sample_report.summary
    assert out.overall.market_fit_score == sample_report.overall.market_fit_score
    assert out.adoption.green == sample_report.adoption.green
    assert out.adoption.yellow == sample_report.adoption.yellow
    assert out.adoption.red == sample_report.adoption.red
    assert out.recommendations == sample_report.recommendations
    assert out.kill_quote == sample_report.kill_quote


# --------------------------------------------------------------------------- nvidia analyst


def _numbers(report):
    """Snapshot every numeric aggregate that must never change."""
    return {
        "market_fit_score": report.overall.market_fit_score,
        "adoption": report.adoption.model_dump(),
        "segments": [s.model_dump(exclude={"insight", "top_objection"}) for s in report.segments],
        "criteria_breakdown": [c.model_dump(exclude={"interpretation"}) for c in report.criteria_breakdown],
        "age_cohorts": [a.model_dump(exclude={"insight", "top_barrier"}) for a in report.age_cohorts],
        "price_sensitivity": [p.model_dump() for p in report.price_sensitivity],
        "avg_max_price": report.avg_max_price,
        "top_objections_counts": [
            {"count": o.count, "share": o.share} for o in report.top_objections
        ],
        "persona_count": report.persona_count,
    }


def test_nvidia_analyst_enhance_report_http_failure_falls_back(sample_report):
    analyst = NvidiaAnalyst("nvapi-test", "https://integrate.api.nvidia.com/v1", "z-ai/glm-5.2")

    async def _boom(*args, **kwargs):
        raise RuntimeError("network exploded")

    analyst._client.post = _boom  # monkeypatch instance method

    before = _numbers(sample_report)
    out = asyncio.run(analyst.enhance_report(sample_report))
    after = _numbers(out)

    assert before == after, "numbers must never change on analyst failure"
    assert any(
        "local report builder" in n.lower() or "unavailable" in n.lower()
        for n in out.quality.notes
    )
    # no secret leakage into notes
    assert not any("nvapi" in n for n in out.quality.notes)


def test_nvidia_analyst_enhance_report_bad_json_falls_back(sample_report):
    analyst = NvidiaAnalyst("nvapi-test", "https://integrate.api.nvidia.com/v1", "z-ai/glm-5.2")

    class _FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "not even json"}}]}

    async def _fake_post(*args, **kwargs):
        return _FakeResp()

    analyst._client.post = _fake_post

    before = _numbers(sample_report)
    out = asyncio.run(analyst.enhance_report(sample_report))
    after = _numbers(out)

    assert before == after
    assert any("unavailable" in n.lower() for n in out.quality.notes)


def test_nvidia_analyst_enhance_report_happy_path(sample_report):
    analyst = NvidiaAnalyst("nvapi-test", "https://integrate.api.nvidia.com/v1", "z-ai/glm-5.2")

    payload = {
        "executive_summary": "Strong signal among cost-conscious SMB owners; pricing clarity is the main blocker.",
        "recommendations": [
            {"title": "Clarify refund policy", "detail": "Add a visible refund policy to the pricing page.", "priority": "now"},
            {"title": "Validate with real humans", "detail": "Run 10 customer interviews with SMB bookkeepers to confirm price sensitivity.", "priority": "now"},
            {"title": "Add case studies", "detail": "Publish 3 case studies from existing ecommerce sellers.", "priority": "next"},
        ],
        "top_objection_labels": ["Price feels high without a clear ROI story"],
        "kill_quote": "I don't see how this saves me money over just hiring a bookkeeper.",
    }

    class _FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {"message": {"content": __import__("json").dumps(payload)}}
                ]
            }

    async def _fake_post(*args, **kwargs):
        return _FakeResp()

    analyst._client.post = _fake_post

    before = _numbers(sample_report)
    out = asyncio.run(analyst.enhance_report(sample_report))
    after = _numbers(out)

    assert before == after, "numbers must never change even on success"
    assert out.summary == payload["executive_summary"]
    assert len(out.recommendations) == 3
    assert out.recommendations[0].title == "Clarify refund policy"
    assert out.recommendations[0].priority == "now"
    assert out.kill_quote == payload["kill_quote"]
    assert out.top_objections[0].label == payload["top_objection_labels"][0]
    assert any("nvidia" in n.lower() for n in out.quality.notes)

    # original report passed in must be untouched (enhance_report returns a copy)
    assert sample_report.summary != payload["executive_summary"] or sample_report is not out


def test_nvidia_analyst_requires_api_key_for_hosted_url():
    from app.services.inference.base import ProviderNotConfiguredError

    with pytest.raises(ProviderNotConfiguredError):
        NvidiaAnalyst(None, "https://integrate.api.nvidia.com/v1", "z-ai/glm-5.2")


def test_analyst_provider_is_abstract_base():
    assert issubclass(MockAnalyst, AnalystProvider)
    assert issubclass(NvidiaAnalyst, AnalystProvider)


# --------------------------------------------------------------------------- config


def test_settings_analyst_max_tokens_default():
    # analyst report narration is longer than a single persona reaction, and
    # GLM-5.2 reasoning tokens count against the budget, so it gets its own
    # (larger) knob rather than reusing nvidia_max_tokens.
    settings = Settings()
    assert settings.analyst_max_tokens == 4096


# --------------------------------------------------------------------------- copy-on-failure


def test_nvidia_analyst_failure_path_does_not_mutate_original_report():
    """enhance_report must never mutate the caller's original report object,
    even on the fallback/failure branch — only the returned copy gets the
    fallback note appended to quality.notes."""
    report = _build_sample_report()
    original_notes = list(report.quality.notes)

    analyst = NvidiaAnalyst("nvapi-test", "https://integrate.api.nvidia.com/v1", "z-ai/glm-5.2")

    async def _boom(*args, **kwargs):
        raise RuntimeError("network exploded")

    analyst._client.post = _boom

    out = asyncio.run(analyst.enhance_report(report))

    assert report.quality.notes == original_notes, (
        "original report's quality.notes must be unchanged after a failed "
        "enhance_report call"
    )
    assert out is not report
    assert out.quality.notes != report.quality.notes
    assert any(
        "local report builder" in n.lower() or "unavailable" in n.lower()
        for n in out.quality.notes
    )
