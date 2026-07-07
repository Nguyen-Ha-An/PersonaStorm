"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, CardHeader, StatusBadge } from "@/components/ui";
import { PersonaGrid } from "@/components/storm/PersonaGrid";
import { LiveCounters } from "@/components/storm/LiveCounters";
import { QuoteFeed } from "@/components/storm/QuoteFeed";
import { ReportView } from "@/components/report/ReportView";
import { getPublicReport } from "@/lib/api";
import { formatNumberCompact, formatPercent } from "@/lib/format";
import { useStormStream } from "@/lib/useStormStream";
import { DEMO_STORM_ID } from "@/lib/server/demo";
import type { StormReport } from "@/lib/types";

const SKELETON_CELL_COUNT = 300;

/**
 * Public, no-signup demo. Streams the pre-baked PersonaPilot run into the real
 * 1,000-cell persona grid, then reveals the verdict-first report — identical to
 * the authenticated report, via the shared <ReportView>. Lives OUTSIDE the
 * auth-gated (app) group so a logged-out evaluator can see the whole loop.
 */
export default function DemoPage() {
  const s = useStormStream(DEMO_STORM_ID);
  const [report, setReport] = useState<StormReport | null>(null);
  const done = s.progress?.completed ?? 0;
  const doneFraction = s.total > 0 ? done / s.total : 0;

  useEffect(() => {
    if (!s.complete) return;
    let cancelled = false;
    getPublicReport(DEMO_STORM_ID)
      .then((r) => {
        if (!cancelled && r) setReport(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [s.complete]);

  const badge = s.complete
    ? { tone: "green" as const, label: "complete", pulse: false }
    : s.connected
      ? { tone: "cyan" as const, label: "streaming", pulse: true }
      : { tone: "yellow" as const, label: "connecting", pulse: true };

  return (
    <div className="bg-tunnel min-h-screen">
      <header className="border-b border-storm-800/80 bg-storm-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-[75rem] items-center justify-between px-5 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-storm-100">
            <span className="h-2 w-2 rounded-full bg-accent-primary" aria-hidden /> PersonaStorm
          </Link>
          <div className="flex items-center gap-2.5">
            <StatusBadge tone={badge.tone} pulse={badge.pulse}>
              {badge.label}
            </StatusBadge>
            <Link href="/signup">
              <Button size="sm">Run your own →</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[75rem] space-y-8 px-5 py-8 sm:px-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-primary">
            Live demo · no signup
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-storm-100 sm:text-2xl">
            Watch 1,000 AI personas react to a product concept
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-storm-300">
            A pre-baked PersonaStorm run for “PersonaPilot”, an AI copilot for SMB operations — streamed
            live, then diagnosed into a verdict-first market report.
          </p>
        </div>

        {!s.complete && (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-storm-400">
                <span className="font-mono tabular-nums">
                  {formatNumberCompact(done)} / {formatNumberCompact(s.total)} personas reacted
                </span>
                <span className="font-mono tabular-nums">{formatPercent(doneFraction)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-storm-800">
                <div
                  className="h-full rounded-full bg-accent-primary transition-all duration-300"
                  style={{ width: `${doneFraction * 100}%` }}
                />
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <Card>
                <CardHeader
                  title="Persona responses"
                  action={
                    <div className="flex items-center gap-3 text-xs text-storm-400">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-[2px] bg-signal-green/85" /> Adopts
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-[2px] bg-signal-yellow/80" /> Unsure
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-[2px] bg-signal-red/80" /> Rejects
                      </span>
                    </div>
                  }
                />
                <div className="p-5">
                  {s.cells.length > 0 ? (
                    <PersonaGrid cells={s.cells} reactions={s.reactions} />
                  ) : (
                    <div
                      className="grid w-full gap-[3px]"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(11px, 1fr))" }}
                      aria-hidden
                    >
                      {Array.from({ length: SKELETON_CELL_COUNT }).map((_, i) => (
                        <div key={i} className="skeleton aspect-square rounded-[2px]" />
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              <div className="space-y-6">
                <LiveCounters progress={s.progress} total={s.total} />
                <QuoteFeed quotes={s.quotes} />
              </div>
            </div>
          </div>
        )}

        {s.complete && !report && (
          <p className="text-sm text-storm-300">Aggregating the swarm into a report…</p>
        )}

        {report && <ReportView report={report} />}

        {s.connectionError && (
          <Card className="border-signal-red/30 p-5 text-sm text-storm-200">
            Couldn’t reach the demo stream.{" "}
            <Link href="/signup" className="text-accent-primary underline">
              Run your own instead →
            </Link>
          </Card>
        )}

        <p className="border-t border-storm-800 pt-5 text-xs leading-relaxed text-storm-500">
          Synthetic output from a calibrated persona model — a hypothesis generator for pre-research,
          objections and price bands to validate with real humans, not a replacement for user research.
        </p>
      </main>
    </div>
  );
}
