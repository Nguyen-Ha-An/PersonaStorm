"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Button, Card, CardHeader, StatusBadge } from "@/components/ui";
import { CreditPill } from "@/components/ui/CreditPill";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/feedback";
import { PersonaGrid } from "@/components/storm/PersonaGrid";
import { LiveCounters } from "@/components/storm/LiveCounters";
import { QuoteFeed } from "@/components/storm/QuoteFeed";
import { getStormMeta } from "@/lib/api";
import { formatNumberCompact, formatPercent } from "@/lib/format";
import { useStormStream } from "@/lib/useStormStream";
import type { StormMeta } from "@/lib/types";

// Shown pre-first-cell so first-time visitors see the promised sensor array
// forming instead of a lone loading string.
const SKELETON_CELL_COUNT = 300;

export default function LiveStormPage() {
  const params = useParams<{ id: string }>();
  const stormId = params?.id ?? null;
  const [retryKey, setRetryKey] = useState(0);

  if (!stormId) {
    return (
      <DashboardShell title="Live Simulation">
        <ErrorState title="No storm selected" message="This URL is missing a storm ID." />
      </DashboardShell>
    );
  }

  return (
    <LiveStormView key={retryKey} stormId={stormId} onRetry={() => setRetryKey((k) => k + 1)} />
  );
}

function LiveStormView({ stormId, onRetry }: { stormId: string; onRetry: () => void }) {
  const s = useStormStream(stormId);
  const [meta, setMeta] = useState<StormMeta | null>(null);
  const done = s.progress?.completed ?? 0;
  const doneFraction = s.total > 0 ? done / s.total : 0;

  // One lightweight meta fetch — surfaces the storm's own title and the price paid.
  useEffect(() => {
    getStormMeta(stormId)
      .then((m) => setMeta(m))
      .catch(() => setMeta(null));
  }, [stormId]);

  const badge = s.failed
    ? { tone: "red" as const, label: "error", pulse: false }
    : s.complete
      ? { tone: "green" as const, label: "complete", pulse: false }
      : s.connected
        ? { tone: "cyan" as const, label: "streaming", pulse: true }
        : { tone: "yellow" as const, label: "connecting", pulse: true };

  const statusLine = s.failed
    ? "This simulation didn't finish."
    : s.complete
      ? "All personas have reacted — the report is ready."
      : s.connected
        ? "The swarm is reacting in real time."
        : "Connecting to the persona swarm…";

  const actions = (
    <div className="flex items-center gap-2">
      {meta && <CreditPill credits={meta.price_credits} label="credits paid" size="sm" />}
      <StatusBadge tone={badge.tone} pulse={badge.pulse}>
        {badge.label}
      </StatusBadge>
      {s.complete && (
        <Link href={`/storm/${stormId}/report`}>
          <Button size="sm">View report →</Button>
        </Link>
      )}
    </div>
  );

  if (s.connectionError) {
    return (
      <DashboardShell title="Live Simulation" subtitle={<span className="font-mono">{stormId}</span>}>
        <ErrorState
          title="Can't connect to the simulation stream"
          message={s.connectionError}
          onRetry={onRetry}
          homeHref="/storm/new"
          homeLabel="Start a new simulation"
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Live Simulation" subtitle={<span className="font-mono">{stormId}</span>}>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Live simulation"
          title={meta?.title ?? "Preparing your simulation…"}
          subtitle={statusLine}
          actions={actions}
        />

        {s.failed ? (
          <ErrorState
            title="The simulation failed to finish"
            message={`${s.failed} — the credits for this run have been refunded to your wallet.`}
            onRetry={onRetry}
            homeHref="/storm/new"
            homeLabel="Start a new simulation"
          />
        ) : (
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
                  className={`h-full rounded-full transition-all duration-300 ${
                    s.complete ? "bg-signal-green" : "bg-accent-primary"
                  }`}
                  style={{ width: `${s.complete ? 100 : doneFraction * 100}%` }}
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
                        <span className="h-2 w-2 rounded-[2px] bg-signal-green/85" />
                        Adopts
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-[2px] bg-signal-yellow/80" />
                        Unsure
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-[2px] bg-signal-red/80" />
                        Rejects
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

        {s.complete && (
          <Card className="border-signal-green/30 bg-signal-green/[0.06] p-6 text-center">
            <p className="text-sm text-storm-200">
              All {formatNumberCompact(s.total)} personas have reacted. The aggregator clustered
              objections, built the price curve, and scored signal quality.
            </p>
            <Link href={`/storm/${stormId}/report`} className="mt-4 inline-block">
              <Button size="lg">Open the report →</Button>
            </Link>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
