"""Provider factory tests — INFERENCE_PROVIDER routing (mock/nvidia/vllm).

Fireworks and NIM providers were removed in favor of a single NvidiaProvider
(name="nvidia"). These tests exercise `factory.get_provider(settings)` exactly
as `storm_runner.py` calls it: with a `Settings`-like object, not kwargs.
"""

import pytest

from app.config import Settings
from app.services.inference import MockPersonaProvider, ProviderNotConfiguredError
from app.services.inference.factory import get_provider


def _settings(**overrides) -> Settings:
    return Settings(**overrides)


def test_get_provider_mock_default():
    settings = _settings()
    provider = get_provider(settings)
    assert isinstance(provider, MockPersonaProvider)
    assert provider.name == "mock"


def test_get_provider_nvidia_returns_nvidia_provider_with_key():
    settings = _settings(
        inference_provider="nvidia",
        nvidia_api_key="nvapi-test",
    )
    provider = get_provider(settings)
    assert provider.name == "nvidia"


def test_get_provider_nvidia_without_key_on_hosted_url_raises():
    settings = _settings(
        inference_provider="nvidia",
        nvidia_api_key=None,
        nvidia_base_url="https://integrate.api.nvidia.com/v1",
    )
    with pytest.raises(ProviderNotConfiguredError):
        get_provider(settings)
