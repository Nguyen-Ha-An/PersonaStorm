# Hackathon demo script (~2.5 minutes)

**Setup before judges arrive:** `make api` in one terminal, `make web` in
another, browser on `http://localhost:3000`, zoom ~110%. Optional dry run:
the seed makes every storm reproducible, so rehearsal == performance.

---

**[0:00 — the hook]**

> "Teams spend $50k on surveys and ad tests to learn things a landing page
> already gives away. PersonaStorm is a **wind tunnel for products**: before
> you fly the real thing, you fly it through 1,000 calibrated synthetic
> personas and find out where it shakes."

**[0:15 — input]** Click sample **"SaaS landing page"** (InboxZeroed loads —
real copy with a price, proof, SOC2 line). Point at the market dropdown:

> "Six calibrated market presets plus free-text custom segments. We'll storm
> US small-business buyers — 1,000 personas."

Click **Run Storm**.

**[0:30 — the storm, talk over the animation]**

> "Each cell is one persona — not just age and income: price sensitivity,
> skepticism, brand trust, dealbreakers. Green intends to buy, yellow needs
> proof, red is out. Watch the counters: willingness to pay converging live,
> and the top objection updating as the swarm argues."

Hover 2–3 cells to show individual quotes. Point at **collapse risk: low**:

> "The system audits itself while it runs — if the model starts cloning
> answers, this flags it before you trust a single number."

**[1:15 — the report]** Click **Open the report**.

- **Kill quote** (read it aloud — it lands): "This is the single most
  damaging voice in the swarm — picked deterministically, not cherry-picked."
- **Price curve**: "Stated acceptance collapses right past the sticker price —
  that cliff is your pricing experiment, pre-designed."
- **Objection clusters**: "Not 1,000 raw strings — clustered themes, ranked,
  with which segment they hit hardest."
- **Segment heatmap**: "Same product, very different rooms — here's who to
  lead with and who to re-message."

**[2:00 — the trust panel, our differentiator]** Scroll to the bottom.

> "And here's the part most AI tools hide: the trust panel. Persona adherence,
> product grounding, duplicate rate, collapse risk, and a benchmark-confidence
> rating that stays LOW until we've calibrated this category against real
> studies. PersonaStorm doesn't replace research — it tells you **which
> research to buy first**. Every report ends with real-human next steps."

**[2:20 — the platform close]**

> "Under the hood: one calibrated Gemma model, persona-conditioned — not a
> thousand models. Today it runs on a deterministic local engine; the same
> interface swaps to Gemma on Fireworks or vLLM on an AMD MI300X, where 192 GB
> of HBM3 runs the whole 27B swarm on one GPU. That's a config line, not a
> rewrite. The wind tunnel is ready for real wind."

---

**Q&A ammo**
- "Is this real research?" → No — synthetic hypothesis generation; disclaimer
  ships inside every report payload; last recommendation is always a real-human study.
- "Why believe the numbers?" → Don't, yet: that's what the trust panel and the
  calibration roadmap (survey-paired LoRA tuning) are for. We show our error
  bars instead of hiding them.
- "Why not 1,000 fine-tunes?" → docs/architecture.md — cost, drift-invisibility,
  and calibration all break; persona-as-data + one calibrated model wins.
- Backup if a laptop dies: `python scripts/run_local_demo.py` runs the entire
  storm headless in a terminal in ~1 second.
