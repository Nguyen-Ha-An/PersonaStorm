"""Per-persona failure tolerance (react_batch) and the storm drop-cap policy."""

import asyncio

import pytest

from app.services.inference.base import PersonaInferenceProvider
from app.services.inference import MockPersonaProvider
from app.services.persona import PersonaGenerator
from app.services.stimulus_parser import parse_stimulus
from app.services.storm_runner import (
    SwarmDropCapExceeded,
    StormManager,
    StormRun,
    evaluate_drop_cap,
)
from app.config import Settings
from app.schemas.storm import StormCreateRequest

STIM = "AI copilot for sales teams. $40/seat/mo. 14-day trial. Used by 300 teams."


class _FlakyProvider(PersonaInferenceProvider):
    """Delegates to the mock but fails the first `n_fail` react() calls."""

    name = "flaky"

    def __init__(self, n_fail: int):
        self._mock = MockPersonaProvider(seed=3)
        self._n_fail = n_fail
        self._seen = 0
        self._lock = asyncio.Lock()

    async def react(self, persona, stimulus, stimulus_type, features=None, category=None):
        async with self._lock:
            self._seen += 1
            fail = self._seen <= self._n_fail
        if fail:
            raise RuntimeError("simulated inference failure")
        return await self._mock.react(persona, stimulus, stimulus_type, features, category)


def test_react_batch_drops_failed_personas():
    personas, _ = PersonaGenerator(seed=3).generate("us_smb", 20)
    features = parse_stimulus(STIM, "Copilot", "product_concept")
    provider = _FlakyProvider(n_fail=3)
    reactions = asyncio.run(
        provider.react_batch(personas, STIM, "product_concept", features, concurrency=4)
    )
    assert len(reactions) == 17  # 20 - 3 dropped
    assert all(r.persona_id for r in reactions)


def test_react_batch_all_success_returns_all():
    personas, _ = PersonaGenerator(seed=3).generate("us_smb", 20)
    features = parse_stimulus(STIM, "Copilot", "product_concept")
    provider = _FlakyProvider(n_fail=0)
    reactions = asyncio.run(
        provider.react_batch(personas, STIM, "product_concept", features, concurrency=4)
    )
    assert len(reactions) == 20


def test_evaluate_drop_cap_no_drops_returns_none():
    assert evaluate_drop_cap(50, 50, 0.10) is None


def test_evaluate_drop_cap_within_cap_returns_note():
    note = evaluate_drop_cap(50, 47, 0.10)
    assert note is not None
    assert "3 of 50" in note


def test_evaluate_drop_cap_at_cap_boundary_allows():
    # exactly 10% dropped is allowed (not > cap)
    assert evaluate_drop_cap(50, 45, 0.10) is not None


def test_evaluate_drop_cap_over_cap_raises():
    with pytest.raises(SwarmDropCapExceeded):
        evaluate_drop_cap(50, 40, 0.10)


def _manager_with_flaky(tmp_path, n_fail, drop_fraction=0.10):
    (tmp_path / "data" / "benchmark_samples").mkdir(parents=True, exist_ok=True)
    settings = Settings(
        inference_provider="mock",
        analyst_provider="mock",
        data_dir=tmp_path / "data",
        runs_dir=tmp_path / "runs",
        swarm_max_drop_fraction=drop_fraction,
        storm_batch_size=200,
        storm_batch_interval_ms=0,
    )
    manager = StormManager(settings)
    manager.provider = _FlakyProvider(n_fail=n_fail)  # bypass mock so drops happen
    return manager


def _request():
    return StormCreateRequest(
        title="Copilot", stimulus_type="product_concept", stimulus=STIM,
        target_market="us_smb", persona_count=50,
    )


def test_execute_within_cap_completes_with_drop_note(tmp_path):
    manager = _manager_with_flaky(tmp_path, n_fail=2)  # 2/50 = 4% -> within cap
    run = StormRun(_request(), seed=3)
    manager.runs[run.id] = run
    asyncio.run(manager._execute(run))
    assert run.status.value == "complete"
    assert any("dropped after retries" in n for n in run.report.quality.notes)


def test_execute_over_cap_fails_storm(tmp_path):
    manager = _manager_with_flaky(tmp_path, n_fail=10)  # 10/50 = 20% -> over cap
    run = StormRun(_request(), seed=3)
    manager.runs[run.id] = run
    asyncio.run(manager._execute(run))
    assert run.status.value == "failed"
    assert run.error is not None
