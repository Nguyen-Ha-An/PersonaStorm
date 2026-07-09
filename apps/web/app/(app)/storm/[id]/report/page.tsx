"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Button, Skeleton } from "@/components/ui";
import { ErrorState } from "@/components/feedback";
import { ReportView } from "@/components/report/ReportView";
import { OrchestrationView } from "@/components/orchestration/OrchestrationView";
import { getReport, getOrchestration } from "@/lib/api";
import { formatNumberCompact } from "@/lib/format";
import type { OrchestrationRecord, StormReport } from "@/lib/types";

const MARKET_LABELS: Record<string, string> = {
  sea_genz: "SEA Gen Z",
  us_smb: "US SMB SaaS buyers",
  parents: "Parents / family buyers",
  enterprise: "Enterprise buyers",
  budget: "Budget-conscious consumers",
  early_adopters: "Early adopters",
  custom: "Custom segment",
};

/** Small neutral spinner for transitional loading — not the brand pulse dot. */
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-storm-400" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const stormId = params?.id;
  const [report, setReport] = useState<StormReport | null>(null);
  const [orchestration, setOrchestration] = useState<OrchestrationRecord | null>(null);
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

  // Re-hydrate the orchestration layer (if any) on load — survives page reload.
  useEffect(() => {
    if (!stormId) return;
    let cancelled = false;
    getOrchestration(stormId as string)
      .then((r) => {
        if (!cancelled) setOrchestration(r);
      })
      .catch(() => {
        if (!cancelled) setOrchestration(null);
      });
    return () => {
      cancelled = true;
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
          homeLabel="Run a new simulation"
        />
      </DashboardShell>
    );
  }

  if (!report) {
    return (
      <DashboardShell title="Market evaluation" subtitle="Aggregating swarm signal…">
        <div className="mb-6 flex items-center gap-2.5 text-sm text-storm-300">
          <Spinner />
          <span>Aggregating swarm signal…</span>
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
        <span aria-hidden>⬇</span> JSON
      </Button>
      <Link href="/storm/new" className="hidden sm:block">
        <Button variant="outline" size="sm">
          <span aria-hidden>+</span> New simulation
        </Button>
      </Link>
    </div>
  );

  return (
    <DashboardShell
      title={report.title}
      subtitle={`${MARKET_LABELS[report.target_market] ?? report.target_market} · ${formatNumberCompact(report.persona_count)} personas · ${report.storm_id}`}
      actions={actions}
      width="wide"
    >
      <ReportView report={report} />
      {orchestration ? (
        <div className="mt-8">
          <OrchestrationView record={orchestration} />
        </div>
      ) : null}
    </DashboardShell>
  );
}
