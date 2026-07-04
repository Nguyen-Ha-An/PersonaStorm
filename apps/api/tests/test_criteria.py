from app.services.criteria import registry as reg


def test_core_has_17_criteria():
    assert len(reg.CORE_CRITERIA) == 17
    assert len(reg.CORE_IDS) == 17
    assert len(set(reg.CORE_IDS)) == 17


def test_proof_requirement_is_barrier():
    assert reg.is_barrier("proof_requirement") is True
    assert reg.CRITERION_BY_ID["proof_requirement"].higher_is_better is False


def test_trust_is_positive():
    assert reg.is_barrier("trust") is False


def test_effective_inverts_barriers():
    assert reg.effective("trust", 0.8) == 0.8
    assert abs(reg.effective("proof_requirement", 0.8) - 0.2) < 1e-9
