import pytest

from app.services.criteria.assumptions import ASSUMPTION_DEFS, AssumptionLedger
from app.services.inference.mock_provider import MockPersonaProvider
from app.services.persona.generator import PersonaGenerator


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
