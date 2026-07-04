"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card, CardHeader } from "@/components/ui";
import { PersonaGrid } from "@/components/storm/PersonaGrid";
import { LiveCounters } from "@/components/storm/LiveCounters";
import { QuoteFeed } from "@/components/storm/QuoteFeed";
import { useStormStream } from "@/lib/useStormStream";

export default function LiveStormPage() {
  const params = useParams<{ id: string }>();
  const stormId = params?.id ?? null;
  const s = useStormStream(stormId);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-storm-400">
            live storm · {stormId}
          </p>
          <h1 className="text-2xl font-bold text-white">
            {s.complete ? "Storm complete" : s.failed ? "Storm failed" : "Swarm reacting…"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${
              s.failed
                ? "border-signal-red/50 text-signal-red"
                : s.complete
                  ? "border-signal-green/50 text-signal-green"
                  : "border-signal-cyan/50 text-signal-cyan"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                s.failed
                  ? "bg-signal-red"
                  : s.complete
                    ? "bg-signal-green"
                    : "animate-pulseglow bg-signal-cyan"
              }`}
            />
            {s.failed ? "error" : s.complete ? "complete" : s.connected ? "streaming" : "reconnecting"}
          </span>
          {s.complete && stormId && (
            <Link href={`/storm/${stormId}/report`}>
              <Button>View full report →</Button>
            </Link>
          )}
        </div>
      </div>

      {s.failed ? (
        <Card className="p-8 text-center">
          <p className="text-signal-red">{s.failed}</p>
          <Link href="/" className="mt-4 inline-block">
            <Button variant="outline">← Back to input</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-storm-400">
                persona swarm — hover any cell to hear it
              </p>
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-storm-400">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-[2px] bg-signal-green/85" /> buy
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-[2px] bg-signal-yellow/80" /> unsure
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-[2px] bg-signal-red/80" /> no
                </span>
              </div>
            </div>
            {s.cells.length > 0 ? (
              <PersonaGrid cells={s.cells} reactions={s.reactions} />
            ) : (
              <div className="flex h-64 items-center justify-center font-mono text-sm text-storm-400">
                initializing persona space…
              </div>
            )}
          </Card>

          <div className="space-y-6">
            <LiveCounters progress={s.progress} total={s.total} />
            <QuoteFeed quotes={s.quotes} />
          </div>
        </div>
      )}

      {s.complete && stormId && (
        <Card className="mt-6 border-signal-green/30 bg-signal-green/5 p-6 text-center">
          <p className="text-sm text-storm-200">
            All {s.total.toLocaleString()} personas have reacted. The aggregator has clustered
            objections, built the price curve, and scored signal quality.
          </p>
          <Link href={`/storm/${stormId}/report`} className="mt-4 inline-block">
            <Button className="px-8 py-3 text-base">Open the report →</Button>
          </Link>
        </Card>
      )}
    </main>
  );
}
