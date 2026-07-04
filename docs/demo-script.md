# Hackathon demo script (~2–3 minutes)

**Setup before judges arrive:** `make api` in one terminal, `make web` in
another, browser on `http://localhost:3000`, zoom ~110%. Optional dry run:
the seed makes every storm reproducible, so rehearsal == performance.

---

**[0:00 — traditional research is slow, expensive, small-sample]**

> "Teams spend $50k and 3-4 weeks on surveys, focus groups, and ad tests to
> learn things a landing page already gives away — and even then it's 20-30
> people, not a market."

**[0:15 — PersonaStorm is a product wind tunnel]**

> "PersonaStorm is a **wind tunnel for products**: before you fly the real
> thing, you fly it through 1,000 calibrated synthetic personas across 17
> market-fit criteria and find out where it shakes — in about a minute, for
> free."

**[0:30 — paste the AI-SaaS sample]** Click the **"AI SaaS concept"** sample
(PersonaPilot loads — an AI copilot with tiered pricing, a free trial, and a
SOC2-in-progress line). Point at the market dropdown and the (optional)
product-category selector:

> "Ten criteria weight presets, auto-detected from the pitch — this one reads
> as an AI tool — or you can override it. We'll storm US small-business
> buyers, 1,000 personas."

**[0:45 — run 1,000 personas]** Click **Run Storm**.

**[1:00 — the live swarm grid, talk over the animation]**

> "Each cell is one persona — not just age and income: price sensitivity,
> skepticism, brand trust, life stage, dealbreakers. Green intends to buy,
> yellow needs proof, red is out."

Point at the **live average market-fit score** and **collapse-risk indicator**
next to the adoption counters:

> "The market-fit score updates live — that's not a vibe, it's a deterministic
> blend of category-weighted criteria plus an age/life-stage overlay. And the
> system audits itself while it runs: if the model starts cloning answers,
> collapse risk flags it before you trust a single number."

Hover 2-3 cells to show individual quotes.

**[1:30 — the report: market-fit score]** Click **Open the report**. Lead
with the hero number.

> "72% market fit, medium confidence. Confidence is capped by how well we've
> benchmarked this category — it can't overstate itself."

**[1:45 — top-3 adoption blockers]**

> "Not just a score — a diagnosis. The system ranks all 17 criteria and
> surfaces the three that are actually gating adoption: here it's trust,
> proof requirement, and differentiation. Price isn't even in the top three —
> that changes what you fix first."

**[2:00 — age-cohort + segment breakdown]**

> "Segment heatmap: same product, very different rooms — here's who to lead
> with and who to re-message. And age cohorts: early-career buyers adopt at
> 61%, blocked mainly by subscription fatigue; a teen cohort, if present,
> would show parent-approval and safety-concern barriers instead — the
> overlay criteria change by life stage, not just the numbers."

**[2:15 — the kill quote]**

> "This is the single most damaging voice in the swarm — picked
> deterministically by rejection strength and specificity, not cherry-picked."
> (Read it aloud — it lands.)

**[2:25 — the trust/calibration panel, our differentiator]** Scroll to the
bottom.

> "And here's the part most AI tools hide: persona adherence, product
> grounding, duplicate rate, criteria consistency, age-cohort variance,
> collapse risk, and a benchmark-confidence rating that stays LOW until we've
> calibrated this category against real studies. We show our error bars
> instead of hiding them."

**[2:45 — close: validate with real humans next]**

> "Under the hood: one calibrated model, persona-conditioned across a
> 17-criterion schema — not a thousand models. Today it runs on a
> deterministic local engine; the same interface swaps to Gemma on Fireworks
> or vLLM on an AMD MI300X, where 192 GB of HBM3 runs the whole 27B swarm on
> one GPU. But the headline isn't the score — it's this: PersonaStorm doesn't
> replace research. **It tells you what to validate with real humans next.**
> Every report ends there."

---

**Q&A ammo**
- "Is this real research?" → No — synthetic hypothesis generation; disclaimer
  ships inside every report payload; `next_human_validation` always points to
  a concrete real-human test.
- "Where does the market-fit score come from?" → Deterministic system logic
  (`compute_market_fit`), never a model invention — category weights + age
  overlay + bounded modifiers + rare hard gates, always explained. See
  docs/criteria-system.md.
- "Why believe the numbers?" → Don't, yet: that's what the trust panel and the
  calibration roadmap (survey-paired LoRA tuning) are for.
- "Why not 1,000 fine-tunes?" → docs/architecture.md — cost, drift-invisibility,
  and calibration all break; persona-as-data + one calibrated model wins.
- Backup if a laptop dies: `python scripts/run_local_demo.py` runs the entire
  storm headless in a terminal in ~1 second.
