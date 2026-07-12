# lablab.ai submission kit — AMD Developer Hackathon: ACT II (Unicorn Track)

Copy-paste assets for the submission form. Everything here describes what is
actually shipped (live app, public image, 421 tests) — no vaporware claims.

---

## Project Title

**PersonaStorm — The Product Wind Tunnel**

*(shorter variant if the field is tight: "PersonaStorm")*

---

## Short Description

> Paste a product idea and 1,000 calibrated synthetic personas storm it on the
> Fireworks AI API — returning a market evaluation dashboard with a trust
> panel honest enough to tell you when NOT to believe it.

*(≈220 chars. Ultra-short variant, ≈110 chars: "A product wind tunnel:
1,000 synthetic personas stress-test your idea on Fireworks AI before you
spend money on real research.")*

---

## Long Description

Every founder faces the same brutal math: real pre-launch research — surveys,
panels, focus groups — costs thousands of dollars and weeks per iteration. So
most people skip it and launch blind. The result is the most common startup
failure mode there is: building something nobody wants.

PersonaStorm is a **product wind tunnel**. Paste a product concept, landing
page, ad, or pricing table, and it generates **1,000 structured synthetic
personas** for your target market — built from evidence-annotated trait
priors with correlated sampling, not stereotypes — classifies your product
into one of 10 categories, and runs every persona through a **calibrated
17-criterion market evaluation** (plus age/life-stage overlays). You watch
the swarm react live on a 1,000-cell green/yellow/red grid, then get a full
**Market Evaluation Dashboard**: market-fit score, top adoption blockers,
objection clusters, price sensitivity, segment and age-cohort insights, and
recommended next steps.

What makes it different is the **honesty architecture**. The LLM is never
allowed to invent a number: personas provide reaction text and raw judgments,
while every score — including the market-fit score itself — is recomputed by
a deterministic server-side scoring engine. Every directional assumption the
engine makes is recorded in a per-run **assumptions ledger**. And every
report ships with a **trust/calibration panel** that will happily tell you
not to trust a run: collapse risk, how much of the persona model is
evidence-backed vs. estimated, whether semantic grounding was real or a
formula fallback, and what to validate with real humans next. Synthetic
research tools die on the question "why should I believe this?" — PersonaStorm
answers it structurally.

All live inference runs on the **Fireworks AI API** with a single key: the
persona reaction swarm, a semantic grounding assessor (one call per storm
that scores what the product *is*, not just its copy), an analyst that
re-narrates the report, and an orchestrated worker swarm where a planner
brain delegates to DeepSeek-V4-Flash workers — hard-capped at 10 physical
API calls per storm, with extra demand absorbed as *virtual agents* inside
shard prompts. An AMD Instinct MI300X / ROCm self-hosted vLLM path for the
same swarm is designed and plumbed (one .env change). Stage 2 of the
inference roadmap in the repo covers it.

And it's not a demo shell — it's a working SaaS: Supabase auth, credit
wallets, atomic per-run billing with auto-refunds, an admin console, a
deployed production app, a public Docker image that runs the whole product
with zero keys (deterministic offline mode), and **421 automated tests**
across two behaviorally-identical engine implementations (production
TypeScript + Python reference mirror).

Try it: https://personastorm.nguyenhaan.id.vn — or
`docker run -p 3000:3000 ghcr.io/nguyen-ha-an/personastorm:latest`

---

## Technology Tags

`Fireworks AI` · `DeepSeek V4` · `Next.js` · `TypeScript` · `Python` ·
`FastAPI` · `Supabase` · `PostgreSQL` · `Vercel` · `Docker` ·
`GitHub Actions` · `vLLM` · `ROCm` · `Tailwind CSS` · `Server-Sent Events`

## Category Tags

`SaaS` · `AI Agents` · `Multi-Agent Systems` · `Market Research` ·
`Synthetic Data` · `Product Validation` · `Startup Tools` · `Simulation`

---

## Cover Image — generation prompt

Use with any strong text-to-image model; target 16:9 (e.g. 1920×1080).

> A dramatic dark-mode SaaS product hero image: a vast grid of 1,000 tiny
> glowing cells in green, amber, and red, swirling like a storm system /
> hurricane seen from above, converging around a single illuminated product
> card floating at the center. Subtle lightning arcs between cell clusters.
> Deep navy-black background (#0a0f1e), electric blue and violet accent
> glow, thin cyan data-stream lines, faint chart and gauge UI elements at
> the edges suggesting an analytics dashboard. Clean, premium, modern
> tech-startup aesthetic, cinematic lighting, high contrast, sharp focus,
> no people, no readable interface text. Wide 16:9 composition with
> negative space at the top-left for a title overlay.

Then overlay in an editor (don't ask the model to render text):
**PersonaStorm** — *The product wind tunnel* · "1,000 synthetic personas.
One honest verdict."

Negative prompt (if supported): `photorealistic people, faces, brand logos,
watermarks, gibberish text, clutter, low contrast`.

---

## Video Presentation — 4½-minute script

Record at 1080p with the app at https://personastorm.nguyenhaan.id.vn or the
Docker image. The default demo mode is deterministic, so every take is
identical. If you show a live Fireworks run, use a small persona count
(~50) and say so on camera — honesty is the brand.

| Time | On screen | Script |
|---|---|---|
| 0:00–0:20 | Landing page, slow zoom on the tagline | "This is PersonaStorm — a wind tunnel for product ideas. Before you spend a dollar on real market research, you fly your idea through a storm of one thousand synthetic customers — and get an honest verdict in about a minute." |
| 0:20–0:50 | Slide or B-roll: crossed-out survey invoice | "Real pre-launch research costs thousands of dollars and takes weeks. So most founders skip it and launch blind — and the number-one startup killer is still 'built something nobody wants.' PersonaStorm makes the first research pass cost cents, not thousands." |
| 0:50–1:30 | Click **AI SaaS concept** sample → `/storm/new`, point at the live price preview → **Run Storm** | "I'll paste in a product concept — a landing page, an ad, or a pricing table all work. PersonaStorm builds one thousand personas for the target market from evidence-annotated trait priors — personas are data, not a thousand chatbots — and prices the run up front from my credit wallet." |
| 1:30–2:10 | The live 1,000-cell grid streaming green/amber/red | "Now the storm. Every cell is one persona reacting through a seventeen-criterion market evaluation — need intensity, price-value, differentiation, trust, switching cost, and more, weighted by product category and age group. The inference runs on the Fireworks AI API — open DeepSeek models, one API key for the whole pipeline." |
| 2:10–3:10 | Scroll the report: verdict banner → top blockers → criteria breakdown → objection clusters → a persona quote → price sensitivity | "And here's the dashboard. Market-fit score, top adoption blockers, objection clusters with real persona quotes, price sensitivity by segment. Here's the architectural bet: the language model is never allowed to invent a number. Reactions give text and raw judgments; every score you see is recomputed by a deterministic scoring engine. Same seed, same result, every time." |
| 3:10–3:50 | Zoom on the **trust/calibration panel** | "And this is the part I'm proudest of: the trust panel. PersonaStorm tells you when NOT to believe it — how much of the persona model is evidence-backed, which assumptions fired, whether semantic grounding was real or a fallback, and exactly what to validate with real humans next. Synthetic research you can't interrogate is worthless. This one shows its work." |
| 3:50–4:20 | Wallet page → admin console → terminal: the one-line `docker run` | "It's a real product, not a demo: auth, credit wallets, atomic billing with refunds, an admin console, four hundred twenty-one automated tests across two mirrored engines — and the whole thing ships as one public Docker container that runs with zero keys." |
| 4:20–4:40 | Architecture slide: Fireworks logo-free diagram, MI300X box | "Built for the AMD stack: Fireworks AI is the live inference layer today — with a hard cap of ten physical API calls per storm thanks to virtual-agent packing — and a vLLM-on-MI300X ROCm path is already plumbed for self-hosted serving." |
| 4:40–5:00 | Landing page + URL/image/repo on screen | "PersonaStorm. Fly your idea through the storm before the market does. Live at personastorm.nguyenhaan.id.vn — links below." |

---

## Slide Presentation — 10 slides

**Slide 1 — Title.**
PersonaStorm — *The product wind tunnel.* 1,000 synthetic personas. One
honest verdict. (AMD Developer Hackathon: ACT II — Unicorn Track. Live app +
GHCR image URLs at the bottom.)

**Slide 2 — The problem.**
Real pre-launch research: $5k–$50k, 2–6 weeks per iteration → most founders
skip it → #1 startup killer: "no market need." The first research pass
should cost cents and take a minute.

**Slide 3 — The solution.**
Paste concept / ad / pricing → 1,000 calibrated personas → 17-criterion
market evaluation streamed live → Market Evaluation Dashboard: fit score,
blockers, objections, price sensitivity, segment risks, next steps.

**Slide 4 — See it (screenshot slide).**
Left: the live 1,000-cell storm grid mid-run. Right: the report verdict
banner + top blockers. Caption: "Deterministic demo mode — zero keys; live
mode — one Fireworks key."

**Slide 5 — How it works (architecture).**
stimulus → parser/classifier → persona space (evidence-annotated priors,
correlated sampling) → semantic assessor (1 Fireworks call/storm) → reaction
swarm (Fireworks DeepSeek) → **deterministic scoring engine** → aggregation →
analyst re-narration (Fireworks) → dashboard. Callout: LLMs produce text and
raw judgments — never a score, count, or verdict.

**Slide 6 — The honesty engine (why we win).**
Assumptions ledger (every nudge recorded per run) · evidence-labeled priors ·
clamp-or-drop LLM trust boundary · known-outcome benchmark backtest in CI ·
a trust panel that says "don't trust this run" when warranted. Tagline:
*The moat isn't the swarm — it's that you can interrogate it.*

**Slide 7 — Built on the AMD stack.**
Fireworks AI API = the live inference layer (reaction swarm + semantic +
analyst + orchestrated worker swarm; open DeepSeek-V4 models; JSON-schema
structured output; ONE key). Hard cap: ≤10 physical calls/storm via
virtual-agent packing. Next: self-hosted vLLM on AMD Instinct MI300X/ROCm —
provider already plumbed, one .env change.

**Slide 8 — A real product, today.**
Deployed SaaS (Vercel + Supabase): auth, credit wallets, atomic per-run
billing + refunds, admin console. Public Docker image (zero-key mode).
421 tests green across two mirrored engines (TS production + Python
reference). CI: tests → build → deploy → publish, every push.

**Slide 9 — Market & vision.**
Who: indie founders, PMs, growth/CRO teams, agencies, VCs screening deals.
Wedge: pre-research triage nobody does today. Model: credits per run
(already implemented — 1,000-persona run = 65 credits). Roadmap: curated
real-outcome benchmark → measured accuracy; MI300X serving; per-segment
persona models.

**Slide 10 — Try it now.**
Live: https://personastorm.nguyenhaan.id.vn ·
`docker run -p 3000:3000 ghcr.io/nguyen-ha-an/personastorm:latest` ·
GitHub: Nguyen-Ha-An/PersonaStorm. Closing line: *"Fly your idea through the
storm before the market does."*
