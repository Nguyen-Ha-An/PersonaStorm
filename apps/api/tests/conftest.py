import os

import pytest
from fastapi.testclient import TestClient

FAST_ENV = {
    "INFERENCE_PROVIDER": "mock",
    "STORM_BATCH_SIZE": "200",
    "STORM_BATCH_INTERVAL_MS": "0",  # no demo pacing in tests
    # No SUPABASE_* set -> the API uses the in-memory gateway + the auth
    # override below, so the whole suite runs without a live Supabase.
}

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


class Actor:
    """Mutable stand-in for the authenticated caller. Tests flip `id`/`role`
    to act as different users (ownership, admin) against one shared gateway."""

    def __init__(self, user_id: str = TEST_USER_ID, email: str = "user@test.dev", role: str = "user"):
        self.id = user_id
        self.email = email
        self.role = role
        self.full_name = "Test User"


@pytest.fixture()
def actor() -> Actor:
    return Actor()


@pytest.fixture()
def client(tmp_path, actor):
    os.environ.update(FAST_ENV)
    os.environ["RUNS_DIR"] = str(tmp_path / "runs")
    os.environ["DATA_DIR"] = str(tmp_path / "data")
    # Ensure a clean, unconfigured Supabase so the in-memory gateway is used.
    for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET"):
        os.environ.pop(key, None)

    from fastapi import Request

    from app.config import get_settings

    get_settings.cache_clear()
    from app.auth import CurrentUser, get_current_user
    from app.main import create_app

    app = create_app()

    async def _fake_current_user(request: Request):
        # Provision the caller (profile + wallet + starter credits) on first use,
        # mirroring the handle_new_user() trigger, then return the actor identity.
        gw = request.app.state.gateway
        await gw.ensure_and_get_profile(actor.id, actor.email, actor.full_name)
        return CurrentUser(
            id=actor.id, email=actor.email, full_name=actor.full_name, role=actor.role
        )

    app.dependency_overrides[get_current_user] = _fake_current_user

    # Context manager runs lifespan -> manager/gateway exist; background tasks
    # run in the TestClient's event loop thread.
    with TestClient(app) as c:
        c.actor = actor  # convenience handle
        yield c
    get_settings.cache_clear()


SAMPLE_STIMULUS = (
    "MealPilot is an AI meal planning app for busy families. It builds a weekly "
    "dinner plan around your kids' allergies, auto-generates a grocery list, and "
    "syncs with Instacart. Pricing: $12/month after a 14-day free trial. "
    "Cancel anytime. Used by 4,000 families; average family saves 3 hours a week."
)


def create_payload(**overrides):
    payload = {
        "title": "MealPilot",
        "stimulus_type": "product_concept",
        "stimulus": SAMPLE_STIMULUS,
        "target_market": "parents",
        "persona_count": 60,
    }
    payload.update(overrides)
    return payload
