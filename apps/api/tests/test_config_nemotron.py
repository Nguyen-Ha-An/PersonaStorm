"""Config knobs for live nemotron inference (reasoning, retries, tolerance)."""

from app.config import Settings


def test_new_inference_defaults_are_off():
    s = Settings()
    assert s.nvidia_enable_thinking is False
    assert s.nvidia_reasoning_budget is None
    assert s.nvidia_structured_output is None
    assert s.nvidia_max_retries == 3
    assert s.swarm_max_drop_fraction == 0.10
    assert s.analyst_model is None


def test_effective_structured_output_defaults_to_guided_json():
    # Preserves today's behavior: nvidia_use_guided_json defaults True.
    assert Settings().effective_structured_output == "guided_json"


def test_effective_structured_output_legacy_bool_false_maps_to_json_object():
    assert Settings(nvidia_use_guided_json=False).effective_structured_output == "json_object"


def test_effective_structured_output_explicit_wins_over_legacy_bool():
    s = Settings(nvidia_use_guided_json=True, nvidia_structured_output="none")
    assert s.effective_structured_output == "none"


def test_reasoning_fields_parse_from_values():
    s = Settings(nvidia_enable_thinking=True, nvidia_reasoning_budget=4096)
    assert s.nvidia_enable_thinking is True
    assert s.nvidia_reasoning_budget == 4096
