"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Button, Card, CardHeader, SectionRule, Skeleton } from "@/components/ui";
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
import { getReport } from "@/lib/api";
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
          timer = setTimeout(poll, 800);
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
      <DashboardShell title="Report">
        <ErrorState
          title="Couldn't load this report"
          message={error}
          onRetry={retry}
          homeHref="/storm/new"
          homeLabel="Run a new storm"
        />
      </DashboardShell>
    );
  }

  if (!report) {
    return (
      <DashboardShell title="Market evaluation" subtitle="aggregating swarm signal…">
        <div className="mb-6 flex items-center gap-3">
          <span className="h-2 w-2 animate-pulseglow rounded-full bg-signal-cyan" />
          <p className="font-mono text-sm uppercase tracking-[0.2em] text-signal-cyan">
            aggregating swarm signal…
          </p>
        </div>
        <p className="mb-8 text-xs text-storm-400">
          If the storm is still streaming, this page fills in automatically when it finishes.
        </p>
        <div className="space-y-6">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-28 w-full" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      </DashboardShell>
    );
  }

  const actions = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={downloadJson}>
        ⬇ JSON
      </Button>
      <Link href="/storm/new" className="hidden sm:block">
        <Button variant="outline" size="sm">
          + New storm
        </Button>
      </Link>
    </div>
  );

  return (
    <DashboardShell
      title={report.title}
      subtitle={`${MARKET_LABELS[report.target_market] ?? report.target_market} · ${report.persona_count.toLocaleString()} personas · ${report.storm_id}`}
      actions={actions}
      width="wide"
    >
      <div className="space-y-6">
        <MarketFitHero report={report} />

        <Card>
          <CardHeader title="Executive summary" />
          <p className="p-6 text-sm leading-relaxed text-storm-200">{report.summary}</p>
        </Card>

        <BlockerCards report={report} />

        <SectionRule>criteria diagnosis</SectionRule>
        <div className="grid gap-6 lg:grid-cols-2">
          <CriteriaRadar report={report} />
          <CriteriaBreakdown report={report} />
        </div>

        <StrengthCards report={report} />
        <AgeCohortBreakdown report={report} />

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

        <SectionRule>evidence</SectionRule>
        <SegmentHeatmap report={report} />

        <Card>
          <CardHeader title="Segment insights" />
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {report.segments.map((sg) => (
              <div key={sg.segment} className="rounded-xl border border-storm-800 bg-storm-850 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold leading-snug text-storm-100">{sg.segment}</p>
                  <span className="shrink-0 font-mono text-xs text-signal-cyan">
                    {Math.round(sg.adoption_rate * 100)}% adopt
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-storm-300">{sg.insight}</p>
              </div>
            ))}
          </div>
        </Card>

        <ObjectionsTable report={report} />
        <KillQuoteCard report={report} />

        <SectionRule>next steps</SectionRule>
        <NextValidationPanel report={report} />
        <Recommendations report={report} />
        <TrustPanel report={report} />
      </div>
    </DashboardShell>
  );
}
