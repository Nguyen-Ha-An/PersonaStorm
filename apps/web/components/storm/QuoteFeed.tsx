"use client";

import { Card, CardHeader, StatusDot } from "@/components/ui";
import type { QuoteItem } from "@/lib/useStormStream";

export function QuoteFeed({ quotes }: { quotes: QuoteItem[] }) {
  return (
    <Card>
      <CardHeader title="Live voices" hint="latest reactions" />
      <div className="max-h-72 space-y-2.5 overflow-y-auto p-4">
        {quotes.length === 0 && (
          <p className="py-4 text-center text-xs text-storm-400">waiting for first reactions…</p>
        )}
        {quotes.map((q, i) => (
          <div
            key={`${q.persona_id}-${i}`}
            className="animate-fade-up rounded-xl border border-storm-800 bg-storm-850/70 px-3 py-2.5"
          >
            <div className="mb-1 flex items-center gap-2">
              <StatusDot status={q.status} />
              <span className="truncate font-mono text-[10px] uppercase tracking-wider text-storm-400">
                {q.persona_id} · {q.segment}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-storm-200">“{q.quote}”</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
