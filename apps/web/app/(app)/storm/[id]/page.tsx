"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Button, Card, StatusBadge } from "@/components/ui";
import { ErrorState } from "@/components/feedback";
import { PersonaGrid } from "@/components/storm/PersonaGrid";
import { LiveCounters } from "@/components/storm/LiveCounters";
import { QuoteFeed } from "@/components/storm/QuoteFeed";
import { getStormMeta } from "@/lib/api";
import { useStormStream } from "@/lib/useStormStream";

export default function LiveStormPage() {
  const params = useParams<{ id: string }>();
  const stormId = params?.id ?? null;
  const [retryKey, setRetryKey] = useState(0);

  if (!stormId) {
    return (
      <DashboardShell title="Live Storm">
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
  const [price, setPrice] = useState<number | null>(null);
  const done = s.progress?.completed ?? 0;
  const pct = s.total > 0 ? Math.round((done / s.total) * 100) : 0;

  // One lightweight meta fetch for the "price paid" chip.
  useEffect(() => {
    getStormMeta(stormId)
      .then((m) => setPrice(m.price_credits))
      .catch(() => setPrice(null));
  }, [stormId]);

  const badge = s.failed
    ? { tone: "red" as const, label: "error", pulse: false }
    : s.complete
      ? { tone: "green" as const, label: "complete", pulse: false }
      : s.connected
        ? { tone: "cyan" as const, label: "streaming", pulse: true }
        : { tone: "yellow" as const, label: "connecting", pulse: true };

  const heading = s.complete ? "Storm complete" : s.failed ? "Storm failed" : "Swarm reacting…";

  const actions = (
    <div className="flex items-center gap-2">
      {price !== null && (
        <span className="hidden rounded-lg border border-storm-800 bg-storm-900/70 px-2.5 py-1.5 font-mono text-[11px] text-storm-300 sm:inline-flex">
          {price} credits paid
        </span>
      )}
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
      <DashboardShell title="Live Storm" subtitle={stormId}>
        <ErrorState
          title="Can't connect to the storm stream"
          message={s.connectionError}
          onRetry={onRetry}
          homeHref="/storm/new"
          homeLabel="Start a new storm"
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={heading} subtitle={`live storm · ${stormId}`} actions={actions}>
      {!s.failed && (
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] text-storm-400">
            <span>
              {done.toLocaleString()} / {s.total.toLocaleString()} personas reacted
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-storm-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                s.complete ? "bg-signal-green" : "bg-signal-cyan"
              }`}
              style={{ width: `${s.complete ? 100 : pct}%` }}
            />
          </div>
        </div>
      )}

      {s.failed ? (
        <ErrorState
          title="The storm failed to finish"
          message={`${s.failed} — the credits for this run have been refunded to your wallet.`}
          onRetry={onRetry}
          homeHref="/storm/new"
          homeLabel="Start a new storm"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-storm-400">
                persona swarm — hover any cell to hear it
              </p>
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-storm-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-signal-green/85" /> buy
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-signal-yellow/80" /> unsure
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-signal-red/80" /> no
                </span>
              </div>
            </div>
            {s.cells.length > 0 ? (
              <PersonaGrid cells={s.cells} reactions={s.reactions} />
            ) : (
              <div className="flex h-64 items-center justify-center font-mono text-sm text-storm-400">
                <span className="animate-pulseglow">initializing persona space…</span>
              </div>
            )}
          </Card>

          <div className="space-y-6">
            <LiveCounters progress={s.progress} total={s.total} />
            <QuoteFeed quotes={s.quotes} />
          </div>
        </div>
      )}

      {s.complete && (
        <Card className="mt-6 border-signal-green/30 bg-signal-green/[0.06] p-6 text-center">
          <p className="text-sm text-storm-200">
            All {s.total.toLocaleString()} personas have reacted. The aggregator clustered
            objections, built the price curve, and scored signal quality.
          </p>
          <Link href={`/storm/${stormId}/report`} className="mt-4 inline-block">
            <Button size="lg">Open the report →</Button>
          </Link>
        </Card>
      )}
    </DashboardShell>
  );
}
