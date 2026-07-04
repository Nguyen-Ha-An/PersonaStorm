from __future__ import annotations
from dataclasses import dataclass
from .registry import CORE_IDS

@dataclass(frozen=True)
class Preset:
    category: str
    weights: dict
    age_overlay_lambda: float

_FLOOR = 0.02  # every core criterion keeps a small non-zero weight

_RAW: dict[str, dict] = {
    "ai_tool": {"trust":.14,"differentiation":.13,"proof_requirement":.12,"value_clarity":.10,
                "perceived_roi":.10,"workflow_fit":.09,"pricing_acceptance":.08,"need_intensity":.08,
                "activation_likelihood":.07,"retention_potential":.05,"shareability":.04},
    "b2b_saas": {"perceived_roi":.15,"workflow_fit":.14,"trust":.12,"switching_willingness":.11,
                 "pricing_acceptance":.10,"proof_requirement":.10,"solution_fit":.09,"differentiation":.06,
                 "activation_likelihood":.05,"retention_potential":.04},
    "consumer_app": {"ease_of_understanding":.15,"activation_likelihood":.14,"shareability":.12,
                     "retention_potential":.11,"value_clarity":.10,"need_intensity":.09,"solution_fit":.08,
                     "repeat_usage_potential":.07,"differentiation":.05},
    "ecommerce_product": {"perceived_roi":.13,"pricing_acceptance":.13,"trust":.12,"value_clarity":.11,
                          "differentiation":.10,"need_intensity":.09,"solution_fit":.08,"proof_requirement":.08,
                          "shareability":.05},
    "education_product": {"trust":.14,"proof_requirement":.12,"perceived_roi":.12,"pricing_acceptance":.11,
                          "need_intensity":.10,"repeat_usage_potential":.09,"solution_fit":.08,"value_clarity":.07},
    "marketplace": {"trust":.14,"need_intensity":.12,"activation_likelihood":.11,"value_clarity":.10,
                    "pricing_acceptance":.09,"differentiation":.09,"retention_potential":.08,"shareability":.07},
    "social_product": {"shareability":.16,"activation_likelihood":.13,"retention_potential":.12,
                       "need_intensity":.10,"ease_of_understanding":.10,"value_clarity":.08,"differentiation":.07},
    "hardware_product": {"perceived_roi":.13,"trust":.12,"proof_requirement":.11,"differentiation":.11,
                         "value_clarity":.10,"pricing_acceptance":.10,"need_intensity":.09,"solution_fit":.08},
    "luxury_product": {"differentiation":.16,"trust":.13,"perceived_roi":.11,"shareability":.11,
                       "need_intensity":.10,"value_clarity":.09,"pricing_acceptance":.06,"retention_potential":.06},
    "generic": {},  # all-floor => uniform
}
_LAMBDA = {"ai_tool":.12,"b2b_saas":.07,"consumer_app":.20,"ecommerce_product":.15,"education_product":.25,
           "marketplace":.15,"social_product":.22,"hardware_product":.15,"luxury_product":.20,"generic":.15}
CATEGORY_IDS = tuple(_RAW.keys())

def resolve_preset(category: str) -> Preset:
    cat = category if category in _RAW else "generic"
    raw = {cid: _RAW[cat].get(cid, _FLOOR) for cid in CORE_IDS}
    total = sum(raw.values())
    weights = {cid: w / total for cid, w in raw.items()}
    return Preset(category=cat, weights=weights, age_overlay_lambda=_LAMBDA[cat])
