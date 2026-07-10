import time

import pytest

from app.services.criteria.assumptions import ASSUMPTION_DEFS, AssumptionLedger
from app.services.inference.mock_provider import MockPersonaProvider
from app.services.persona.generator import PersonaGenerator

from .conftest import create_payload


def test_registry_and_ledger():
    ledger = AssumptionLedger()
    ledger.fire("pricing_dealbreaker_injection")
    ledger.fire("pricing_dealbreaker_injection")
    fired = {f["id"]: f for f in ledger.fired()}
    assert fired["pricing_dealbreaker_injection"]["personas_affected"] == 2
    assert ASSUMPTION_DEFS["pricing_dealbreaker_injection"]["max_rate"] == 0.4


def test_unregistered_assumption_raises():
    with pytest.raises(ValueError, match="unregistered"):
        AssumptionLedger().fire("made_up_nudge")


def test_pricing_injection_bounded_at_40_percent():
    ledger = AssumptionLedger()
    PersonaGenerator(seed=13, ledger=ledger).generate("budget", 400)
    fired = {f["id"]: f for f in ledger.fired()}
    assert fired["pricing_dealbreaker_injection"]["personas_affected"] <= 160


@pytest.mark.asyncio
async def test_skeptic_without_proof_dealbreaker_can_raise_no_proof():
    personas, _, _ = PersonaGenerator(seed=21).generate("early_adopters", 1)
    p = personas[0].model_copy(update={"skepticism": 0.95, "dealbreakers": ["not mobile friendly"]})
    provider = MockPersonaProvider(seed=21)
    r = await provider.react(p, "Zenlytics — a dashboard that makes teams smarter.", "product_concept", None, None)
    assert r.qualitative.top_negative_trigger in {
        "no evidence for the claims", "unclear value", "not obviously for me",
        "hidden pricing", "no reference customers",
    }


def test_report_carries_calibration_evidence(client):
    """Task 12: the reference-engine report carries a calibration_evidence
    block (priors provenance + fired assumptions), mirroring apps/web's
    buildCalibrationEvidence() — minus counterfactual_audit, which does not
    exist in this engine (documented parity exception)."""
    resp = client.post(
        "/api/storm/create",
        json=create_payload(target_market="budget", persona_count=200),
    )
    assert resp.status_code == 200, resp.text
    storm_id = resp.json()["storm_id"]

    deadline = time.time() + 30.0
    report = None
    while time.time() < deadline:
        r = client.get(f"/api/storm/{storm_id}/report")
        if r.status_code == 200:
            report = r.json()
            break
        assert r.status_code == 202, r.text
        time.sleep(0.1)
    assert report is not None, "report never became ready"

    ce = report["calibration_evidence"]
    assert ce is not None
    assert ce["priors_source"] in ("data_files", "embedded_unverified")
    assert any(
        a["id"] == "pricing_dealbreaker_injection" for a in ce["assumptions_fired"]
    )


def test_low_coverage_data_files_priors_get_confidence_downgrade(client):
    """All shipped priors/*.json files are 100% 'unverified' evidence status,
    so a normal data_files run has priors_coverage == 0 — as unvalidated as
    the embedded fallback, but previously not flagged. Mirrors the
    stormEngine.ts buildCalibrationEvidence() low-coverage downgrade."""
    resp = client.post(
        "/api/storm/create",
        json=create_payload(target_market="budget", persona_count=50),
    )
    assert resp.status_code == 200, resp.text
    storm_id = resp.json()["storm_id"]

    deadline = time.time() + 30.0
    report = None
    while time.time() < deadline:
        r = client.get(f"/api/storm/{storm_id}/report")
        if r.status_code == 200:
            report = r.json()
            break
        assert r.status_code == 202, r.text
        time.sleep(0.1)
    assert report is not None, "report never became ready"

    ce = report["calibration_evidence"]
    assert ce is not None
    assert ce["priors_source"] == "data_files"
    assert ce["priors_coverage"] == 0
    assert any("almost entirely unsourced" in d for d in ce["confidence_downgrades"])
