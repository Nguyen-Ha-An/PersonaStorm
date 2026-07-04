"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardHeader, Input, Label, Select, Textarea } from "@/components/ui";
import { createStorm } from "@/lib/api";
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

export default function LandingPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [stimulus, setStimulus] = useState("");
  const [stimulusType, setStimulusType] = useState<StimulusType>("product_concept");
  const [market, setMarket] = useState<TargetMarket>("us_smb");
  const [customDesc, setCustomDesc] = useState("");
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
        persona_count: count,
      });
      router.push(`/storm/${resp.storm_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start storm");
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
    <main className="mx-auto max-w-7xl px-6">
      {/* hero */}
      <section className="py-14 text-center">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-signal-cyan">
          1,000 synthetic personas · one calibrated model · live objection radar
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl">
          Put your idea in the wind tunnel{" "}
          <span className="text-storm-300">before the market does.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-storm-300">
          Paste a product concept, landing page, ad, or pricing table. PersonaStorm streams
          reactions from a structured persona swarm — surfacing likely objections, price
          resistance, and segment risks <em>before</em> you spend on surveys, ads, or launches.
          Synthetic signal, honestly labeled. Not a replacement for real research.
        </p>
      </section>

      {/* input console */}
      <section className="mx-auto max-w-3xl pb-10">
        <Card>
          <CardHeader title="Test chamber input" hint="no data leaves your machine in mock mode" />
          <div className="space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-storm-400">Try a sample:</span>
              {SAMPLES.map((s, i) => (
                <button
                  key={s.name}
                  onClick={() => loadSample(i)}
                  className="rounded-full border border-storm-700 px-3 py-1 text-xs text-storm-300 transition hover:border-signal-cyan/60 hover:text-white"
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

            <div className="grid gap-5 sm:grid-cols-2">
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
                <Label htmlFor="count">Persona count</Label>
                <Select
                  id="count"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
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
              <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-4 py-3 text-sm text-signal-red">
                {error} — is the API running on port 8000?
              </div>
            )}

            <Button onClick={runStorm} disabled={!canRun} className="w-full py-3 text-base">
              {submitting ? "Spinning up the tunnel…" : `⛈ Run Storm — ${count.toLocaleString()} personas`}
            </Button>
          </div>
        </Card>

        <div className="mt-6 grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
          {[
            ["Objection radar", "clustered themes ranked by frequency, per segment"],
            ["Price sensitivity", "demand curve from 1,000 stated willingness-to-pay points"],
            ["Trust panel", "collapse risk, adherence & grounding shown on every report"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-storm-800 bg-storm-900/50 px-4 py-3">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-signal-cyan">{t}</p>
              <p className="mt-1 text-xs leading-relaxed text-storm-400">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
