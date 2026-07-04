#!/usr/bin/env python3
"""Headless end-to-end storm: personas -> mock swarm -> quality -> report.

Proves the whole pipeline works without the web stack (useful for CI and for
judges who want to see the machinery). Writes the full run to data/runs/.

Usage:
    python scripts/run_local_demo.py [--market parents] [--count 500] [--seed 1337]
"""

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.schemas.storm import StormCreateRequest  # noqa: E402
from app.services.aggregation import build_report  # noqa: E402
from app.services.inference import MockPersonaProvider  # noqa: E402
from app.services.persona import PersonaGenerator  # noqa: E402
from app.services.quality import compute_quality  # noqa: E402
from app.services.stimulus_parser import parse_stimulus  # noqa: E402

def _load_stimulus(path: Path) -> str:
    """Sample files carry a markdown doc header — strip it so header words
    don't pollute the parser's anchor tokens."""
    lines = [ln for ln in path.read_text().splitlines() if not ln.startswith("#")]
    return "\n".join(lines).strip()


STIMULUS = _load_stimulus(ROOT / "data" / "sample_inputs" / "product_concept_mealpilot.md")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", default="parents")
    ap.add_argument("--count", type=int, default=500)
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    req = StormCreateRequest(
        title="MealPilot (headless demo)",
        stimulus_type="product_concept",
        stimulus=STIMULUS,
        target_market=args.market,
        persona_count=args.count,
    )

    t0 = time.time()
    print(f"→ generating {args.count} personas for '{args.market}' (seed {args.seed})…")
    personas, diversity = PersonaGenerator(seed=args.seed).generate(args.market, args.count)
    print(f"  diversity ok={diversity.ok} warnings={diversity.warnings or 'none'}")

    features = parse_stimulus(req.stimulus, req.title, req.stimulus_type.value)
    print(f"→ swarm reacting (pricing={features.has_pricing}, proof={features.has_proof}, "
          f"trial={features.has_free_trial})…")
    provider = MockPersonaProvider(seed=args.seed)
    reactions = await provider.react_batch(personas, req.stimulus,
                                           req.stimulus_type.value, features)

    print("→ scoring quality + aggregating…")
    quality = compute_quality(personas, reactions, features,
                              benchmark_dir=ROOT / "data" / "benchmark_samples")
    report = build_report("demo_local", req, personas, reactions, features, quality)

    dt = time.time() - t0
    a = report.adoption
    print(f"\n══ STORM COMPLETE in {dt:.2f}s ═══════════════════════════════")
    print(f"  adoption: 🟢 {a.green}  🟡 {a.yellow}  🔴 {a.red}   avg WTP ${report.avg_max_price}")
    print(f"  collapse risk: {quality.collapse_risk} | adherence {quality.persona_adherence} "
          f"| grounding {quality.product_grounding}")
    print("\n  top objections:")
    for o in report.top_objections[:5]:
        print(f"    {o.share:5.0%}  “{o.label}”")
    print(f"\n  kill quote: “{report.kill_quote}”")
    print("\n  recommendations:")
    for r in report.recommendations:
        print(f"    [{r.priority:>4}] {r.title}")

    out = ROOT / "data" / "runs" / "demo_local.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "request": req.model_dump(mode="json"),
        "diversity": diversity.to_dict(),
        "personas": [p.model_dump() for p in personas],
        "reactions": [r.model_dump() for r in reactions],
        "report": report.model_dump(mode="json"),
    }, indent=2))
    print(f"\n  full run persisted → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    asyncio.run(main())
