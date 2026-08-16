# Sample stimulus — brand brief (target: startup founders, product managers, and product marketing teams)

## Brand

**PersonaStorm**

**Category:** AI-assisted product validation / synthetic market research

**Core positioning:** PersonaStorm is a **product wind tunnel**. Before a team spends money on surveys, panels, ad tests, or a launch, it can put a product concept, landing page, ad, or pricing table in front of 1,000 structured synthetic personas and get a fast directional read on likely adoption blockers, price resistance, weak messaging, trust gaps, and segment risk.

**Primary tagline:** **The product wind tunnel — 1,000 synthetic personas. One honest verdict.**

## Audience

The primary audience is early-stage startup founders, product managers, and product marketing teams who need to make a product or go-to-market decision before they have enough real customer research.

They are often preparing to launch, reposition a product, change pricing, rewrite a landing page, choose between concepts, or decide what to validate with real users next. They are time-constrained, skeptical of generic AI opinions, and want a useful signal without pretending that synthetic research is ground truth.

## Problem

Traditional pre-launch research can take days or weeks and can be expensive enough that small teams skip it. The alternative is often internal debate, founder intuition, a few friendly opinions, or asking one language model for a polished but uncalibrated answer.

The result is predictable: teams discover objections, price sensitivity, unclear messaging, and missing trust signals only after they have already spent time and money launching.

## Promise

PersonaStorm gives teams a fast, structured **pre-research hypothesis** about how a market may react, what could block adoption, which segments may respond differently, and which questions deserve real-human validation next.

The product should feel less like an AI oracle and more like a rigorous simulation instrument: useful for finding pressure points, explicit about uncertainty, and designed to help teams decide what to test next.

## How it works

A user pastes a product concept, landing page, advertisement, or pricing table and chooses a target market. PersonaStorm generates 1,000 structured synthetic personas, classifies the product, evaluates reactions across core market criteria plus age/life-stage overlays, and streams the swarm live as adoption, hesitation, and rejection signals.

The final Market Evaluation Dashboard surfaces a system-computed market-fit score, adoption blockers, criterion breakdowns, cohort and segment insights, price sensitivity, objection clusters, and a trust/calibration panel.

The language model is used for qualitative reactions and semantic interpretation, but numerical scores are recomputed by deterministic server-side logic rather than invented by the model.

## Differentiation

PersonaStorm should be positioned against two weak alternatives: expensive research performed too late, and shallow “ask one AI what customers think” tools.

Its differentiation is not simply the number of personas. The stronger brand idea is **calibrated honesty at scale**:

- Synthetic personas are structured data with trait priors rather than 1,000 independent chatbot instances.
- Scores are system-computed instead of being guessed by an LLM.
- A per-run assumptions ledger exposes directional assumptions that influenced the simulation.
- The trust/calibration panel can explicitly tell the user when confidence is weak.
- Every report points toward real-human validation rather than claiming to replace it.

## Brand personality

PersonaStorm should feel **rigorous, sharp, curious, candid, and technically credible**. It can be energetic, but it should never sound magical, prophetic, or overconfident.

The personality is closer to a research instrument with a strong point of view than a friendly AI assistant. It should challenge a product idea without being theatrical about it.

## Voice and tone

Write with short, concrete claims. Prefer evidence, mechanisms, and observable outcomes over AI superlatives.

Use language such as **pressure-test**, **stress-test**, **directional signal**, **likely blocker**, **price resistance**, **trust gap**, **assumption**, **calibration**, and **validate with real users**.

Avoid claims such as **predict your market**, **know exactly what customers want**, **replace user research**, **guaranteed product-market fit**, or any wording that implies synthetic personas are real people.

When uncertainty matters, state it directly rather than hiding it in fine print.

## Messaging hierarchy

**Hero idea:** Pressure-test the product before the market does.

**Primary proof mechanism:** 1,000 structured synthetic personas evaluate the same product from different demographic, behavioral, and life-stage contexts.

**Trust message:** Every score is system-computed, assumptions are surfaced, and the system tells the user what still needs real-human validation.

**Outcome message:** Find likely objections, pricing friction, weak messaging, and risky segments before spending heavily on launch or research.

**Primary CTA:** **Run a Storm**

## Trust guardrails

PersonaStorm is a pre-research wind tunnel, not a substitute for real customer research. Its output is a structured synthetic hypothesis, not a prediction of future sales or a statistically representative survey.

The brand should never hide this limitation. The honesty stance is part of the product value: users should understand both what the simulation can reveal and where it can be wrong.

## Product proof points

The product ships as a full-stack SaaS with live storm streaming, saved runs, reports, authentication, credit wallets, and an admin console. The repository includes mirrored TypeScript and Python engines and hundreds of automated tests.

A standard 1,000-persona storm is priced at **65 credits**, and new accounts receive **100 starter credits**, making a full first run possible without requiring a purchase.

## Visual identity

The visual direction is a **premium research instrument**, not a neon sci-fi AI dashboard. Interfaces should feel dense enough to communicate rigor while remaining calm and legible.

**Base / surfaces**

- Storm 950 — `#0B0E14` — page base
- Storm 900 — `#10141C` — panel surface
- Storm 850 — `#151A23` — cards and inputs
- Storm 800 — `#1C212B` — subtle borders
- Storm 100 — `#F4F7FA` — primary headings
- Storm 300 — `#A7B0C0` — secondary text
- Storm 400 — `#6F7A8E` — muted text

**Signal colors**

- Cyan `#35C7D9` — primary accent and active interaction
- Green `#4CC38A` — adoption / success
- Amber `#D6A84F` — hesitation / risk / attention
- Red `#EF6A7A` — blocker / rejection / failure
- Violet `#8B7CF6` — insight / AI-derived interpretation

Color should behave semantically. Avoid decorative rainbow gradients and default “AI purple glow” aesthetics.

**Typography:** Inter / Inter Variable for interface and editorial text. Use a restrained monospace stack for metrics, IDs, model/runtime labels, and other instrument-like data.

**Motion:** Small, informative transitions such as swarm cells appearing, subtle pulse states, and restrained data-loading motion. Avoid cinematic motion that competes with the research output.

## Brand invariants

PersonaStorm must remain recognizable through four ideas:

1. **Wind tunnel, not oracle.** It pressure-tests ideas; it does not predict the future.
2. **Many perspectives, one structured evaluation.** The swarm is a mechanism, not a visual gimmick.
3. **Honesty is a feature.** Assumptions, calibration, and limits stay visible.
4. **Action after insight.** Every run should help the user decide what to change or validate next.
