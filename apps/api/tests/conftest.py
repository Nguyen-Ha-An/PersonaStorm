import os

import pytest
from fastapi.testclient import TestClient

FAST_ENV = {
    "INFERENCE_PROVIDER": "mock",
    "STORM_BATCH_SIZE": "200",
    "STORM_BATCH_INTERVAL_MS": "0",  # no demo pacing in tests
}


@pytest.fixture()
def client(tmp_path):
    os.environ.update(FAST_ENV)
    os.environ["RUNS_DIR"] = str(tmp_path / "runs")
    os.environ["DATA_DIR"] = str(tmp_path / "data")

    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    app = create_app()
    # Context manager runs lifespan -> manager exists; background tasks run in
    # the TestClient's event loop thread.
    with TestClient(app) as c:
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
