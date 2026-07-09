"""Per-persona failure tolerance (react_batch) and the storm drop-cap policy."""

import asyncio

from app.services.inference.base import PersonaInferenceProvider
from app.services.inference import MockPersonaProvider
from app.services.persona import PersonaGenerator
from app.services.stimulus_parser import parse_stimulus

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
