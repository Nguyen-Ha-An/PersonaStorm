"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardHeader, PageShell, SectionRule, Skeleton } from "@/components/ui";
import { ErrorState } from "@/components/feedback";
import { MarketFitHero } from "@/components/report/MarketFitHero";
import { BlockerCards } from "@/components/report/BlockerCards";
import { CriteriaRadar } from "@/components/report/CriteriaRadar";
import { CriteriaBreakdown } from "@/components/report/CriteriaBreakdown";
import { StrengthCards } from "@/components/report/StrengthCards";
import { AgeCohortBreakdown } from "@/components/report/AgeCohortBreakdown";
import { TrustProofPanel } from "@/components/report/TrustProofPanel";
import { DifferentiationPanel } from "@/components/report/DifferentiationPanel";
import { PricingFitPanel } from "@/components/report/PricingFitPanel";
import { WorkflowFitPanel } from "@/components/report/WorkflowFitPanel";
import { NextValidationPanel } from "@/components/report/NextValidationPanel";
import { KillQuoteCard } from "@/components/report/KillQuoteCard";
import { ObjectionsTable } from "@/components/report/ObjectionsTable";
import { PriceCurve } from "@/components/report/PriceCurve";
import { Recommendations } from "@/components/report/Recommendations";
import { SegmentHeatmap } from "@/components/report/SegmentHeatmap";
import { TrustPanel } from "@/components/report/TrustPanel";
import { API_TARGET_LABEL, getReport } from "@/lib/api";
import type { StormReport } from "@/lib/types";

const MARKET_LABELS: Record<string, string> = {
  sea_genz: "SEA Gen Z",
  us_smb: "US SMB SaaS buyers",
  parents: "Parents / family buyers",
  enterprise: "Enterprise buyers",
  budget: "Budget-conscious consumers",
  early_adopters: "Early adopters",
  custom: "Custom segment",
};

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const stormId = params?.id;
  const [report, setReport] = useState<StormReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!stormId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const r = await getReport(stormId as string);
        if (cancelled) return;
        if (r) {
          setReport(r);
        } else {
          timer = setTimeout(poll, 800); // still running — poll until ready
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the report.");
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stormId, retryKey]);

  const retry = useCallback(() => {
    setError(null);
    setReport(null);
    setRetryKey((k) => k + 1);
  }, []);

  const downloadJson = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `personastorm_${report.storm_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  if (error) {
    return (
      <PageShell className="py-16">
        <ErrorState
          title="Couldn't load this report"
          message={error}
          detail={`API target: ${API_TARGET_LABEL}`}
          onRetry={retry}
          homeLabel="Run a new storm"
        />
      </PageShell>
    );
  }

  if (!report) {
    return (
      <PageShell className="py-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="h-2 w-2 animate-pulseglow rounded-full bg-signal-cyan" />
          <p className="font-mono text-sm uppercase tracking-[0.2em] text-signal-cyan">
            aggregating swarm signal…
          </p>
        </div>
        <p className="mb-8 text-xs text-storm-400">
          If the storm is still streaming, this page fills in automatically when it finishes.
        </p>
        {/* skeleton scaffold mirrors the final report layout */}
        <div className="space-y-6">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-28 w-full" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-6 py-8">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-storm-400">
            market evaluation · {report.storm_id} ·{" "}
            {MARKET_LABELS[report.target_market] ?? report.target_market} ·{" "}
            {report.persona_count.toLocaleString()} personas
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-storm-100">
            {report.title}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadJson}>
            ⬇ Download JSON
          </Button>
          <Link href="/">
            <Button variant="outline">+ New storm</Button>
          </Link>
        </div>
      </div>

      {/* ── 1. Verdict: market-fit diagnosis + adoption forecast ── */}
      <MarketFitHero report={report} />

      {/* executive summary */}
      <Card>
        <CardHeader title="Executive summary" />
        <p className="p-6 text-sm leading-relaxed text-storm-200">{report.summary}</p>
      </Card>

      {/* ── 2. What's blocking adoption ── */}
      <BlockerCards report={report} />

      {/* ── 3 + 4. Criteria radar + weighted breakdown ── */}
      <SectionRule>criteria diagnosis</SectionRule>
      <div className="grid gap-6 lg:grid-cols-2">
        <CriteriaRadar report={report} />
        <CriteriaBreakdown report={report} />
      </div>

      {/* ── 5. Strengths to lead with ── */}
      <StrengthCards report={report} />

      {/* ── 6. Adoption by life stage ── */}
      <AgeCohortBreakdown report={report} />

      {/* ── 7. Focused diagnostic panels ── */}
      <SectionRule>adoption drivers</SectionRule>
      <div className="grid gap-6 lg:grid-cols-2">
        <TrustProofPanel report={report} />
        <DifferentiationPanel report={report} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <PricingFitPanel report={report} />
        <PriceCurve report={report} />
      </div>
      <WorkflowFitPanel report={report} />

      {/* ── 8. Evidence: segments, objections, kill quote ── */}
      <SectionRule>evidence</SectionRule>
      <SegmentHeatmap report={report} />

      {/* segment insights */}
      <Card>
        <CardHeader title="Segment insights" />
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {report.segments.map((s) => (
            <div key={s.segment} className="rounded-xl border border-storm-800 bg-storm-850 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold leading-snug text-storm-100">{s.segment}</p>
                <span className="shrink-0 font-mono text-xs text-signal-cyan">
                  {Math.round(s.adoption_rate * 100)}% adopt
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-storm-300">{s.insight}</p>
            </div>
          ))}
        </div>
      </Card>

      <ObjectionsTable report={report} />
      <KillQuoteCard report={report} />

      {/* ── Next steps: validation queue + recommendations + trust ── */}
      <SectionRule>next steps</SectionRule>
      <NextValidationPanel report={report} />
      <Recommendations report={report} />
      <TrustPanel report={report} />
    </PageShell>
  );
}
