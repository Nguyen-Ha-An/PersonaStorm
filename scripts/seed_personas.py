#!/usr/bin/env python3
"""Export generated persona populations for every preset to data/persona_presets/.

Usage:
    python scripts/seed_personas.py [--count 100] [--seed 1337]
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.services.persona import PersonaGenerator  # noqa: E402
from app.services.persona.presets import PRESETS  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=100)
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    out_dir = ROOT / "data" / "persona_presets"
    out_dir.mkdir(parents=True, exist_ok=True)
    gen = PersonaGenerator(seed=args.seed)

    for key in PRESETS:
        personas, report = gen.generate(key, args.count)
        payload = {
            "preset": key,
            "seed": args.seed,
            "count": len(personas),
            "diversity": report.to_dict(),
            "personas": [p.model_dump() for p in personas],
        }
        path = out_dir / f"generated_{key}.json"
        path.write_text(json.dumps(payload, indent=2))
        status = "ok" if report.ok else f"warnings: {report.warnings}"
        print(f"  {key:<16} -> {path.name}  ({len(personas)} personas, diversity {status})")

    print("\nDone. Inspect the files or feed them into training-data pipelines.")


if __name__ == "__main__":
    main()
