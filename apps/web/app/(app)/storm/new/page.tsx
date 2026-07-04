"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PricePreviewCard } from "@/components/dashboard/PricePreviewCard";
import { Alert, ApiConfigAlert } from "@/components/feedback";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { ApiError, createStorm, getQuote } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SAMPLES } from "@/lib/samples";
import type { Quote, StimulusType, TargetMarket } from "@/lib/types";

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

const COUNTS = [100, 250, 500, 1000, 1200];

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

export default function NewStormPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();

  const [title, setTitle] = useState("");
  const [stimulus, setStimulus] = useState("");
  const [stimulusType, setStimulusType] = useState<StimulusType>("product_concept");
  const [market, setMarket] = useState<TargetMarket>("us_smb");
  const [customDesc, setCustomDesc] = useState("");
  const [category, setCategory] = useState("auto");
  const [count, setCount] = useState(1000);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stimulusOk = stimulus.trim().length >= 20;
  const customOk = market !== "custom" || customDesc.trim().length >= 12;
  const affordable = quote?.has_enough_credits ?? true;
  const canRun = stimulusOk && customOk && affordable && !submitting;

  // Live price preview — re-quote whenever the persona count changes (debounced).
  // A monotonically increasing seq guards against out-of-order responses so a
  // slow earlier request can't overwrite the price for the current count.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteSeq = useRef(0);
  useEffect(() => {
    setQuoteLoading(true);
    if (debounce.current) clearTimeout(debounce.current);
    const seq = ++quoteSeq.current;
    debounce.current = setTimeout(() => {
      getQuote({ persona_count: count, include_analyst_report: true })
        .then((q) => {
          if (seq !== quoteSeq.current) return; // stale response — ignore
          setQuote(q);
          setQuoteError(null);
        })
        .catch((e) => {
          if (seq !== quoteSeq.current) return;
          setQuoteError(e instanceof Error ? e.message : "Could not price this run.");
        })
        .finally(() => {
          if (seq === quoteSeq.current) setQuoteLoading(false);
        });
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [count]);

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
      await refreshMe(); // reflect the deduction in the wallet chip immediately
      router.push(`/storm/${resp.storm_id}`);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "payment") {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Failed to start the storm.");
      }
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
    <DashboardShell title="New Storm" subtitle="Configure a run and see its price before you spend a credit.">
      <ApiConfigAlert />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* form */}
        <Card className="overflow-hidden">
          <div className="border-b border-storm-800 px-6 py-4">
            <h2 className="text-sm font-semibold text-storm-100">Test chamber</h2>
            <p className="text-xs text-storm-400">Paste your stimulus, pick a market, and run the swarm.</p>
          </div>

          <div className="space-y-5 p-6">
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
                <Select id="stype" value={stimulusType} onChange={(e) => setStimulusType(e.target.value as StimulusType)}>
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
                <Select id="market" value={market} onChange={(e) => setMarket(e.target.value as TargetMarket)}>
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
              <Alert tone="red" title="Could not start the storm">
                {error}
              </Alert>
            )}
          </div>
        </Card>

        {/* price + run */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <PricePreviewCard quote={quote} loading={quoteLoading} error={quoteError} />
          <Button onClick={runStorm} disabled={!canRun} size="lg" className="w-full">
            {submitting
              ? "Spinning up the tunnel…"
              : quote
                ? `Run Storm — ${quote.total_credits} credits`
                : "Run Storm"}
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-storm-500">
            Outputs are synthetic hypotheses from a calibrated model. Every report carries a trust
            panel and a real-human validation queue.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
