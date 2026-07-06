"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PricePreviewCard } from "@/components/dashboard/PricePreviewCard";
import { Alert, ApiConfigAlert } from "@/components/feedback";
import { Button, Card, CardHeader, Input, Label, Select, Textarea } from "@/components/ui";
import { ApiError, createStorm, getQuote } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCredits, formatNumberCompact } from "@/lib/format";
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

const COUNT_GLOSS: Record<number, string> = {
  100: "A fast smoke test — directional signal only.",
  250: "A light read — enough to catch obvious misses.",
  500: "A solid baseline for an early positioning call.",
  1000: "Full-depth run — the default for a launch decision.",
  1200: "Maximum depth available for a run.",
};

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

/** One numbered step in the research-setup flow. Wraps `Card`/`CardHeader`
 *  so the visual language matches the rest of the design system. */
function StepCard({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <span className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-storm-700 text-[11px] font-semibold text-storm-300"
            >
              {step}
            </span>
            <span>{title}</span>
          </span>
        }
        hint={hint}
      />
      <div className="space-y-4 p-5">{children}</div>
    </Card>
  );
}

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

  // Presentational-only: whether the field has been blurred yet, so we don't
  // show an error border before the user has had a chance to type anything.
  const [stimulusTouched, setStimulusTouched] = useState(false);
  const [customTouched, setCustomTouched] = useState(false);

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
      await refreshMe(); // reflect the deduction in the credit pill immediately
      router.push(`/storm/${resp.storm_id}`);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "payment") {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Failed to start the simulation.");
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
    <DashboardShell
      title="New simulation"
      subtitle="Configure a run and preview its price before you spend a credit."
    >
      <ApiConfigAlert />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* steps 1–3 */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-storm-400">Try a sample:</span>
            {SAMPLES.map((s, i) => (
              <button
                key={s.name}
                type="button"
                onClick={() => loadSample(i)}
                className="rounded-full border border-storm-700 bg-storm-850 px-3 py-1 text-xs text-storm-300 transition-colors hover:border-storm-600 hover:text-storm-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-storm-950"
              >
                {s.name}
              </button>
            ))}
          </div>

          <StepCard
            step={1}
            title="What are we testing"
            hint="Paste the concept, page, ad, or price you want the market to react to."
          >
            <div className="grid gap-4 sm:grid-cols-2">
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
                onBlur={() => setStimulusTouched(true)}
                placeholder="Paste your product concept, landing page copy, ad text, or pricing table…"
                aria-invalid={!stimulusOk && stimulusTouched}
                className={clsx(
                  !stimulusOk && stimulusTouched && "border-signal-red/60 focus:border-signal-red/60 focus:ring-signal-red/20",
                )}
              />
              <p className="mt-1 text-right text-xs text-storm-400">
                {stimulus.trim().length} chars{" "}
                {!stimulusOk && stimulusTouched && (
                  <span className="text-signal-yellow">· need at least 20</span>
                )}
              </p>
            </div>
          </StepCard>

          <StepCard
            step={2}
            title="Target market"
            hint="Choose who should read this the way a real buyer would."
          >
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>

            {market === "custom" && (
              <div>
                <Label htmlFor="custom">Describe your custom segment</Label>
                <Textarea
                  id="custom"
                  rows={2}
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  onBlur={() => setCustomTouched(true)}
                  placeholder="e.g. privacy-conscious indie game developers in Southeast Asia"
                  aria-invalid={!customOk && customTouched}
                  className={clsx(
                    !customOk && customTouched && "border-signal-red/60 focus:border-signal-red/60 focus:ring-signal-red/20",
                  )}
                />
                {!customOk && customTouched && (
                  <p className="mt-1 text-xs text-signal-yellow">
                    Need at least 12 characters so the persona builder has something to work with.
                  </p>
                )}
              </div>
            )}
          </StepCard>

          <StepCard
            step={3}
            title="Simulation depth"
            hint="How many synthetic personas run through the swarm."
          >
            <div>
              <Label htmlFor="count">Persona count</Label>
              <Select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {COUNTS.map((c) => (
                  <option key={c} value={c}>
                    {formatNumberCompact(c)} personas
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-storm-400">{COUNT_GLOSS[count]}</p>
            </div>
          </StepCard>

          {error && (
            <Alert tone="red" title="Could not start the simulation">
              {error}
            </Alert>
          )}
        </div>

        {/* sticky rail: steps 4–5 */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <PricePreviewCard quote={quote} loading={quoteLoading} error={quoteError} />

          <StepCard step={5} title="Run" hint="Review the price, then launch the swarm.">
            <Button onClick={runStorm} disabled={!canRun} size="lg" className="w-full">
              {submitting
                ? "Spinning up the tunnel…"
                : quote
                  ? `Run wind tunnel — ${formatCredits(quote.total_credits)} credits`
                  : "Open wind tunnel"}
            </Button>
            <p className="text-center text-xs leading-relaxed text-storm-400">
              Outputs are synthetic hypotheses from a calibrated model. Every report carries a trust
              panel and a real-human validation queue.
            </p>
          </StepCard>
        </div>
      </div>
    </DashboardShell>
  );
}
