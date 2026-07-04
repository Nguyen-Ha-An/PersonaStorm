"""End-to-end API tests: create -> stream -> report, plus contract validation."""

import time

from .conftest import create_payload

REPORT_KEYS = {
    "storm_id", "summary", "adoption", "segments", "top_objections",
    "price_sensitivity", "kill_quote", "quality", "recommendations", "disclaimer",
    "product_category", "overall", "criteria_breakdown", "weakest_criteria",
    "strongest_criteria", "age_cohorts", "next_human_validation",
}
QUALITY_KEYS = {
    "persona_adherence", "product_grounding", "generic_response_rate",
    "duplicate_objection_rate", "objection_entropy", "segment_variance",
    "collapse_risk", "benchmark_confidence",
}


def _wait_for_report(client, storm_id, timeout_s=30.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        resp = client.get(f"/api/storm/{storm_id}/report")
        if resp.status_code == 200:
            return resp.json()
        assert resp.status_code == 202, resp.text
        time.sleep(0.1)
    raise AssertionError("report never became ready")


def test_health(client):
    data = client.get("/api/health").json()
    assert data["status"] == "ok"
    assert data["inference_provider"] == "mock"


def test_full_storm_flow(client):
    resp = client.post("/api/storm/create", json=create_payload())
    assert resp.status_code == 200, resp.text
    storm_id = resp.json()["storm_id"]
    assert resp.json()["status"] == "created"

    report = _wait_for_report(client, storm_id)
    assert REPORT_KEYS <= set(report.keys())
    assert QUALITY_KEYS <= set(report["quality"].keys())

    adoption = report["adoption"]
    assert adoption["green"] + adoption["yellow"] + adoption["red"] == 60
    assert report["segments"], "segment breakdown missing"
    assert report["top_objections"], "objection clusters missing"
    assert report["price_sensitivity"], "price curve missing"
    assert report["recommendations"], "recommendations missing"
    assert "synthetic" in report["disclaimer"].lower()
    # positioning rule: at least one recommendation points to real research
    assert any("real" in r["detail"].lower() or "human" in r["title"].lower()
               for r in report["recommendations"])

    # --- Task 10: criteria + age-cohort aggregation -------------------------
    assert isinstance(report["product_category"], str) and report["product_category"]
    assert len(report["criteria_breakdown"]) == 17
    assert 0.0 <= report["overall"]["market_fit_score"] <= 1.0
    assert report["overall"]["confidence"] in ("low", "medium", "high")
    assert report["weakest_criteria"], "weakest_criteria missing"
    assert report["strongest_criteria"], "strongest_criteria missing"
    assert report["age_cohorts"], "age_cohorts missing"
    assert "average_market_fit_score" in report["adoption"]
    assert "average_buy_likelihood" in report["adoption"]
    # confidence must never exceed benchmark confidence
    levels = {"low": 0, "medium": 1, "high": 2}
    assert (levels[report["overall"]["confidence"]]
            <= levels[report["quality"]["benchmark_confidence"]])

    # meta endpoint agrees
    meta = client.get(f"/api/storm/{storm_id}").json()
    assert meta["status"] == "complete"
    assert meta["report_ready"] is True


def test_stream_emits_reactions_and_complete(client):
    resp = client.post("/api/storm/create", json=create_payload(persona_count=50))
    storm_id = resp.json()["storm_id"]

    events = []
    with client.stream("GET", f"/api/storm/{storm_id}/stream") as s:
        for line in s.iter_lines():
            if line.startswith("event: "):
                events.append(line.split("event: ", 1)[1].strip())
            if events and events[-1] in ("complete", "error"):
                break
            if len(events) > 5000:  # safety valve
                break

    assert "init" in events
    assert events.count("reaction") == 50
    assert "progress" in events
    assert events[-1] == "complete"


def test_validation_rules(client):
    # custom market requires a description
    bad = create_payload(target_market="custom")
    assert client.post("/api/storm/create", json=bad).status_code == 422
    # stimulus too short
    bad = create_payload(stimulus="too short")
    assert client.post("/api/storm/create", json=bad).status_code == 422
    # unknown storm id
    assert client.get("/api/storm/nope").status_code == 404
    assert client.get("/api/storm/nope/report").status_code == 404


def test_reproducible_runs_with_seed(client):
    a = client.post("/api/storm/create", json=create_payload(seed=123)).json()["storm_id"]
    b = client.post("/api/storm/create", json=create_payload(seed=123)).json()["storm_id"]
    ra = _wait_for_report(client, a)
    rb = _wait_for_report(client, b)
    assert ra["adoption"] == rb["adoption"]
    assert ra["kill_quote"] == rb["kill_quote"]
