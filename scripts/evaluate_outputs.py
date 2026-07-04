#!/usr/bin/env python3
"""Recompute quality metrics for a persisted storm run — the P0 offline eval.

This is the seed of the evaluation harness in docs/evaluation-framework.md:
run a storm with any provider, persist it, then grade the outputs
independently of the serving path (schema validity + all trust metrics).

Usage:
    python scripts/evaluate_outputs.py                      # newest run
    python scripts/evaluate_outputs.py data/runs/<id>.json  # specific run
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from pydantic import ValidationError  # noqa: E402

from app.schemas.persona import Persona  # noqa: E402
from app.schemas.reaction import PersonaReaction  # noqa: E402
from app.services.quality import compute_quality  # noqa: E402
from app.services.stimulus_parser import parse_stimulus  # noqa: E402


def main() -> None:
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
    else:
        runs = sorted((ROOT / "data" / "runs").glob("*.json"),
                      key=lambda p: p.stat().st_mtime)
        if not runs:
            sys.exit("No persisted runs found. Run scripts/run_local_demo.py first.")
        path = runs[-1]

    print(f"evaluating {path}\n")
    data = json.loads(path.read_text())
    req = data["request"]

    # 1) schema validity — every stored object must round-trip the strict schema
    persona_errors = reaction_errors = 0
    personas, reactions = [], []
    for p in data["personas"]:
        try:
            personas.append(Persona(**p))
        except ValidationError:
            persona_errors += 1
    for r in data["reactions"]:
        try:
            reactions.append(PersonaReaction(**r))
        except ValidationError:
            reaction_errors += 1

    n = max(1, len(data["reactions"]))
    print(f"  schema validity: personas {len(personas)}/{len(data['personas'])} ok, "
          f"reactions {len(reactions)}/{n} ok "
          f"({(1 - reaction_errors / n):.1%} valid)")

    # 2) full trust-metric recompute (independent of what the server stored)
    features = parse_stimulus(req["stimulus"], req["title"], req["stimulus_type"])
    q = compute_quality(personas, reactions, features,
                        benchmark_dir=ROOT / "data" / "benchmark_samples")

    print(f"""
  persona_adherence       {q.persona_adherence}
  product_grounding       {q.product_grounding}
  generic_response_rate   {q.generic_response_rate}
  duplicate_objection_rate{q.duplicate_objection_rate:>8}
  objection_entropy       {q.objection_entropy} ({q.objection_entropy_score})
  segment_variance        {q.segment_variance} ({q.segment_variance_score})
  collapse_risk           {q.collapse_risk} ({q.collapse_risk_score})
  benchmark_confidence    {q.benchmark_confidence} (category: {q.benchmark_category})
""")
    for note in q.notes:
        print(f"  note: {note}")

    stored = (data.get("report") or {}).get("quality")
    if stored and abs(stored["persona_adherence"] - q.persona_adherence) > 1e-6:
        print("\n  ⚠ recomputed metrics differ from stored report — code drifted since this run.")


if __name__ == "__main__":
    main()
