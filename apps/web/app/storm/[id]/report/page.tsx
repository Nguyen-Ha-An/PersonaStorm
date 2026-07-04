"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, CardHeader } from "@/components/ui";
import { AdoptionBar } from "@/components/report/AdoptionBar";
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
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to load report");
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stormId]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-signal-red">{error}</p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="outline">← Run a new storm</Button>
        </Link>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="animate-pulseglow font-mono text-sm uppercase tracking-[0.2em] text-signal-cyan">
          aggregating swarm signal…
        </p>
        <p className="mt-3 text-xs text-storm-400">
          If the storm is still streaming, this page opens automatically when it finishes.
        </p>
      </main>
    );
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `personastorm_${report!.storm_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-storm-400">
            wind tunnel report · {report.storm_id} ·{" "}
            {MARKET_LABELS[report.target_market] ?? report.target_market} ·{" "}
            {report.persona_count.toLocaleString()} personas
          </p>
          <h1 className="mt-1 text-3xl font-bold text-white">{report.title}</h1>
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

      {/* executive summary + adoption */}
      <Card>
        <CardHeader title="Executive summary" />
        <div className="space-y-5 p-6">
          <p className="text-sm leading-relaxed text-storm-200">{report.summary}</p>
          <AdoptionBar report={report} />
        </div>
      </Card>

      {/* kill quote */}
      <KillQuoteCard report={report} />

      {/* heatmap + price curve */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SegmentHeatmap report={report} />
        <PriceCurve report={report} />
      </div>

      {/* objections */}
      <ObjectionsTable report={report} />

      {/* segment insights */}
      <Card>
        <CardHeader title="Segment insights" />
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {report.segments.map((s) => (
            <div key={s.segment} className="rounded-lg border border-storm-800 bg-storm-850 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold leading-snug text-white">{s.segment}</p>
                <span className="shrink-0 font-mono text-xs text-signal-cyan">
                  {Math.round(s.adoption_rate * 100)}% adopt
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-storm-300">{s.insight}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* recommendations + trust */}
      <Recommendations report={report} />
      <TrustPanel report={report} />
    </main>
  );
}
