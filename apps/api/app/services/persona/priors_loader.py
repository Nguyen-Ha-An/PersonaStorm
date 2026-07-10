"""Priors loader — mirror of apps/web .../persona/priorsLoader.ts (spec §4).

Turns data/persona_priors/*.json into PresetSpec + honesty metadata.
Unverified traits get std widened x1.5 (cap 0.20). Missing data dir ->
embedded code presets, loudly labeled, ALSO widened x1.5 (cap 0.20) without
mutating the shared PRESETS objects. Invalid file -> raise (fail fast, never
silent).
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, field
from pathlib import Path

from .presets import PresetSpec, SubSegmentSpec, resolve_preset

_UNVERIFIED_STD_FACTOR = 1.5
_STD_CAP = 0.2
_STATUSES = ("sourced", "derived", "unverified")


@dataclass
class PriorsMeta:
    source: str  # "data_files" | "embedded_unverified"
    coverage: float
    sourced_traits: int
    total_traits: int
    notes: list[str] = field(default_factory=list)


@dataclass
class LoadedPreset:
    preset: PresetSpec
    meta: PriorsMeta
    correlations: list[tuple[str, str, float, str]]


def default_priors_dir() -> Path:
    env = os.environ.get("PERSONA_PRIORS_DIR")
    if env:
        return Path(env)
    # priors_loader.py lives at apps/api/app/services/persona/ — 5 parents up
    # is the repo root (apps/api/app/services/persona -> ... -> apps -> root).
    return Path(__file__).resolve().parents[5] / "data" / "persona_priors"


def load_preset_with_meta(key: str, custom_description: str | None = None, dir: str | None = None) -> LoadedPreset:
    base = Path(dir) if dir else default_priors_dir()
    if key == "custom":
        return _embedded_fallback(key, custom_description, "custom presets are built from the segment description, not data files")
    file = base / f"{key}.json"
    if not file.exists():
        return _embedded_fallback(key, custom_description, f"priors file not found ({file}) — using embedded presets marked unverified")

    raw = json.loads(file.read_text(encoding="utf-8"))  # raises on bad JSON — intended
    subs_in = raw.get("sub_segments")
    if not isinstance(subs_in, list) or not subs_in:
        raise ValueError(f"priors {key}: sub_segments must be a non-empty array")
    embedded = resolve_preset(key, custom_description)

    sourced = 0
    total = 0
    subs: list[SubSegmentSpec] = []
    for i, s in enumerate(subs_in):
        _validate_sub_segment_fields(key, s, i)
        traits_in = s.get("traits")
        if not isinstance(traits_in, dict):
            raise ValueError(f"priors {key}: sub_segments[{i}].traits missing")
        traits: dict[str, tuple[float, float]] = {}
        for name, t in traits_in.items():
            mean, std = t.get("mean"), t.get("std")
            if (
                not isinstance(mean, (int, float))
                or isinstance(mean, bool)
                or not math.isfinite(mean)
                or not 0 <= mean <= 1
            ):
                raise ValueError(f"priors {key}: trait '{name}' mean out of [0,1]")
            if (
                not isinstance(std, (int, float))
                or isinstance(std, bool)
                or not math.isfinite(std)
                or not 0 < std <= 0.5
            ):
                raise ValueError(f"priors {key}: trait '{name}' std out of (0,0.5]")
            status = (t.get("evidence") or {}).get("status", "unverified")
            if status not in _STATUSES:
                raise ValueError(f"priors {key}: trait '{name}' invalid evidence status '{status}'")
            if status == "sourced":
                if not (t.get("evidence") or {}).get("mapping_rule"):
                    raise ValueError(f"priors {key}: trait '{name}' is sourced but has no mapping_rule")
                if not (raw.get("trait_definitions") or {}).get(name):
                    raise ValueError(f"priors {key}: trait '{name}' is sourced but has no operational definition in trait_definitions")
                sourced += 1
            total += 1
            eff_std = min(std * _UNVERIFIED_STD_FACTOR, _STD_CAP) if status == "unverified" else std
            traits[name] = (float(mean), float(eff_std))
        subs.append(SubSegmentSpec(
            name=str(s["name"]), weight=float(s["weight"]),
            age_range=tuple(s["age_range"]), regions=list(s["regions"]),
            income_bands=[(b[0], tuple(b[1])) for b in s["income_bands"]],
            occupations=list(s["occupations"]), traits=traits,
            familiarity=list(s["familiarity"]), research_styles=list(s["research_styles"]),
            buying_triggers=list(s["buying_triggers"]), dealbreaker_pool=list(s["dealbreaker_pool"]),
        ))

    correlations = _validate_pairs(key, raw.get("trait_correlations") or [])
    return LoadedPreset(
        preset=PresetSpec(key=embedded.key, id_prefix=embedded.id_prefix, label=embedded.label, sub_segments=subs),
        meta=PriorsMeta("data_files", sourced / total if total else 0.0, sourced, total),
        correlations=correlations,
    )


def _is_non_empty_string_list(v: object) -> bool:
    return isinstance(v, list) and len(v) > 0 and all(isinstance(x, str) and len(x) > 0 for x in v)


def _is_valid_income_bands(v: object) -> bool:
    if not isinstance(v, list) or len(v) == 0:
        return False
    for b in v:
        if not (isinstance(b, list) and len(b) == 2):
            return False
        label, rng = b
        if not (isinstance(label, str) and len(label) > 0):
            return False
        if not (isinstance(rng, list) and len(rng) == 2):
            return False
        lo, hi = rng
        if isinstance(lo, bool) or isinstance(hi, bool):
            return False
        if not isinstance(lo, (int, float)) or not isinstance(hi, (int, float)):
            return False
        if not math.isfinite(lo) or not math.isfinite(hi):
            return False
    return True


def _validate_sub_segment_fields(key: str, s: dict, i: int) -> None:
    weight = s.get("weight")
    if (
        isinstance(weight, bool)
        or not isinstance(weight, (int, float))
        or not math.isfinite(weight)
        or weight <= 0
    ):
        raise ValueError(f"priors {key}: sub_segments[{i}] weight must be a finite number > 0")
    name = s.get("name")
    if not isinstance(name, str) or len(name) == 0:
        raise ValueError(f"priors {key}: sub_segments[{i}] name must be a non-empty string")
    age_range = s.get("age_range")
    if (
        not isinstance(age_range, list)
        or len(age_range) != 2
        or any(
            isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n)
            for n in age_range
        )
    ):
        raise ValueError(f"priors {key}: sub_segments[{i}] age_range must be an array of 2 numbers")
    for field_name in ("regions", "occupations", "familiarity", "research_styles",
                       "buying_triggers", "dealbreaker_pool"):
        if not _is_non_empty_string_list(s.get(field_name)):
            raise ValueError(f"priors {key}: sub_segments[{i}] {field_name} must be a non-empty array of strings")
    if not _is_valid_income_bands(s.get("income_bands")):
        raise ValueError(
            f"priors {key}: sub_segments[{i}] income_bands must be a non-empty array of [string, [number, number]]"
        )


def _validate_pairs(key: str, pairs: list) -> list[tuple[str, str, float, str]]:
    out = []
    for i, p in enumerate(pairs):
        if not isinstance(p, list) or len(p) < 3:
            raise ValueError(f"priors {key}: trait_correlations[{i}] malformed")
        try:
            r = float(p[2])
        except (TypeError, ValueError):
            raise ValueError(f"priors {key}: trait_correlations[{i}] r must be a number") from None
        if not math.isfinite(r) or abs(r) > 0.95:
            raise ValueError(f"priors {key}: trait_correlations[{i}] |r| must be <= 0.95")
        status = p[3] if len(p) > 3 else "unverified"
        if status not in _STATUSES:
            raise ValueError(f"priors {key}: trait_correlations[{i}] bad status")
        out.append((p[0], p[1], r, status))
    return out


def _widen_sub_segment_traits(s: SubSegmentSpec) -> SubSegmentSpec:
    """Embedded PRESETS are module-level shared state (see presets.py) — never
    mutate the trait records resolve_preset() returns. Build a fresh
    sub-segment/trait dict here so the x1.5 honesty widening applied below
    can't leak back into the shared preset table and corrupt subsequent
    loads."""
    traits = {
        name: (mean, min(std * _UNVERIFIED_STD_FACTOR, _STD_CAP))
        for name, (mean, std) in s.traits.items()
    }
    return SubSegmentSpec(
        name=s.name, weight=s.weight, age_range=s.age_range, regions=s.regions,
        income_bands=s.income_bands, occupations=s.occupations, traits=traits,
        familiarity=s.familiarity, research_styles=s.research_styles,
        buying_triggers=s.buying_triggers, dealbreaker_pool=s.dealbreaker_pool,
    )


def _embedded_fallback(key: str, custom_description: str | None, why: str) -> LoadedPreset:
    resolved = resolve_preset(key, custom_description)
    widened_subs = [_widen_sub_segment_traits(s) for s in resolved.sub_segments]
    preset = PresetSpec(key=resolved.key, id_prefix=resolved.id_prefix, label=resolved.label,
                         sub_segments=widened_subs)
    total = sum(len(s.traits) for s in preset.sub_segments)
    return LoadedPreset(preset, PriorsMeta("embedded_unverified", 0.0, 0, total, [why]), [])
