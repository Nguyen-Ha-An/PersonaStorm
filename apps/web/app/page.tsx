"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Input, Label, PageShell, Select, Textarea } from "@/components/ui";
import { Alert, ApiConfigAlert } from "@/components/feedback";
import { API_TARGET_LABEL, createStorm } from "@/lib/api";
import { SAMPLES } from "@/lib/samples";
import type { StimulusType, TargetMarket } from "@/lib/types";

const STIMULUS_TYPES: { value: StimulusType; label: string }[] = [
  { value: "product_concept", label: "Product concept" },
  { value: "landing_page", label: "Landing page copy" },
  { value: "ad", label: "Ad creative" },
  { value: "pricing_table", label: "Pricing table" },
];

const MARKETS: { value: TargetMarket; label: string }[] = [
  { value: "sea_genz", label: "SEA Gen Z" },
  { value: "us_smb", label: "US SMB SaaS buyers" },
  { value: "parents", label: "Parents / family buyers" },
  { value: "enterprise", label: "Enterprise buyers" },
  { value: "budget", label: "Budget-conscious consumers" },
  { value: "early_adopters", label: "Early adopters" },
  { value: "custom", label: "Custom segment…" },
];

const COUNTS = [100, 250, 500, 1000];

const CATEGORIES: { value: string; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "ai_tool", label: "AI tool" },
  { value: "b2b_saas", label: "B2B SaaS" },
  { value: "consumer_app", label: "Consumer app" },
  { value: "ecommerce_product", label: "E-commerce product" },
  { value: "education_product", label: "Education product" },
  { value: "marketplace", label: "Marketplace" },
  { value: "social_product", label: "Social product" },
  { value: "hardware_product", label: "Hardware product" },
  { value: "luxury_product", label: "Luxury product" },
  { value: "generic", label: "Generic" },
];

const FEATURES: [string, string][] = [
  ["Objection radar", "Clustered themes ranked by frequency, per segment."],
  ["Price sensitivity", "A demand curve from 1,000 stated willingness-to-pay points."],
  ["Trust panel", "Collapse risk, adherence & grounding shown on every report."],
];

export default function LandingPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [stimulus, setStimulus] = useState("");
  const [stimulusType, setStimulusType] = useState<StimulusType>("product_concept");
  const [market, setMarket] = useState<TargetMarket>("us_smb");
  const [customDesc, setCustomDesc] = useState("");
  const [category, setCategory] = useState("auto");
  const [count, setCount] = useState(1000);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stimulusOk = stimulus.trim().length >= 20;
  const customOk = market !== "custom" || customDesc.trim().length >= 12;
  const canRun = stimulusOk && customOk && !submitting;

  async function runStorm() {
    setSubmitting(true);
    setError(null);
    try {
      const resp = await createStorm({
        title: title.trim() || "Untitled concept",
        stimulus_type: stimulusType,
        stimulus: stimulus.trim(),
        target_market: market,
        custom_segment_description: market === "custom" ? customDesc.trim() : undefined,
        product_category: category === "auto" ? undefined : category,
        persona_count: count,
      });
      router.push(`/storm/${resp.storm_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start the storm.");
      setSubmitting(false);
    }
  }

  function loadSample(i: number) {
    const s = SAMPLES[i];
    setTitle(s.title);
    setStimulus(s.stimulus);
    setStimulusType(s.stimulus_type);
    setMarket(s.target_market);
    setError(null);
  }

  return (
    <PageShell className="pb-16">
      {/* hero */}
      <section className="animate-fade-up py-14 text-center sm:py-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-storm-700 bg-storm-900/60 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-storm-300">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-cyan" />
          1,000 personas · one calibrated model · live objection radar
        </span>
        <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight text-storm-100 sm:text-6xl">
          Test the market
          <span className="text-signal-cyan"> before you build it.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-storm-300">
          PersonaStorm is the product wind tunnel. Paste a concept, landing page, ad, or
          pricing table — a synthetic persona swarm reacts live, then it produces a market
          evaluation dashboard surfacing objections, price resistance, and segment risk
          <em className="text-storm-200"> before</em> you spend on surveys, ads, or launches.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-xs text-storm-400">
          Synthetic signal, honestly labeled — not a replacement for real research.
        </p>
      </section>

      {/* input console */}
      <section className="mx-auto max-w-3xl space-y-4">
        <ApiConfigAlert />

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-storm-800 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-storm-100">Test chamber</h2>
              <p className="text-xs text-storm-400">
                Paste your stimulus, choose a market, and run the swarm.
              </p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-storm-500">
              no data leaves your machine in mock mode
            </span>
          </div>

          <div className="space-y-5 p-6">
            {/* samples */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-storm-400">Try a sample:</span>
              {SAMPLES.map((s, i) => (
                <button
                  key={s.name}
                  onClick={() => loadSample(i)}
                  className="rounded-full border border-storm-700 bg-storm-850/60 px-3 py-1 text-xs text-storm-300 transition hover:border-signal-cyan/50 hover:text-storm-100"
                >
                  {s.name}
                </button>
              ))}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="title">Product / test name</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. MealPilot"
                  maxLength={120}
                />
              </div>
              <div>
                <Label htmlFor="stype">Stimulus type</Label>
                <Select
                  id="stype"
                  value={stimulusType}
                  onChange={(e) => setStimulusType(e.target.value as StimulusType)}
                >
                  {STIMULUS_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="stimulus">Stimulus</Label>
              <Textarea
                id="stimulus"
                rows={7}
                value={stimulus}
                onChange={(e) => setStimulus(e.target.value)}
                placeholder="Paste your product concept, landing page copy, ad text, or pricing table…"
              />
              <p className="mt-1 text-right text-xs text-storm-400">
                {stimulus.trim().length} chars{" "}
                {!stimulusOk && stimulus.length > 0 && (
                  <span className="text-signal-yellow">· need ≥ 20</span>
                )}
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <Label htmlFor="market">Target market</Label>
                <Select
                  id="market"
                  value={market}
                  onChange={(e) => setMarket(e.target.value as TargetMarket)}
                >
                  {MARKETS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="category">Product category</Label>
                <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="count">Persona count</Label>
                <Select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {COUNTS.map((c) => (
                    <option key={c} value={c}>
                      {c.toLocaleString()} personas
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {market === "custom" && (
              <div>
                <Label htmlFor="custom">Describe your custom segment</Label>
                <Textarea
                  id="custom"
                  rows={2}
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="e.g. privacy-conscious indie game developers in Southeast Asia"
                />
                {!customOk && customDesc.length > 0 && (
                  <p className="mt-1 text-xs text-signal-yellow">
                    Need at least 12 characters so the persona builder has something to work with.
                  </p>
                )}
              </div>
            )}

            {error && (
              <Alert
                tone="red"
                title="Could not reach PersonaStorm API"
                detail={`Current API target: ${API_TARGET_LABEL}`}
              >
                {error}
              </Alert>
            )}

            <Button onClick={runStorm} disabled={!canRun} size="lg" className="w-full">
              {submitting ? "Spinning up the tunnel…" : `Run Storm — ${count.toLocaleString()} personas`}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-storm-500">
              Outputs are synthetic hypotheses from a calibrated model. Every report carries a
              trust panel and a real-human validation queue.
            </p>
          </div>
        </Card>

        {/* feature strip */}
        <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
          {FEATURES.map(([t, d]) => (
            <div key={t} className="rounded-xl border border-storm-800 bg-storm-900/50 px-4 py-3.5">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-signal-cyan">
                {t}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-storm-400">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
