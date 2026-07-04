"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui";
import type { CriterionBreakdown, StormReport } from "@/lib/types";
import { effectiveScore, toneFor, TONE_RGB, TONE_TEXT, pct } from "./criteria-helpers";

/**
 * Horizontal bars for all 17 criteria. Top-5 by weight shown first; the rest
 * hide behind a working "Show all N" expander (useState). Bars are colored by
 * barrier-aware effective score and widthed by raw score; weight +
 * interpretation shown inline.
 */
export function CriteriaBreakdown({ report }: { report: StormReport }) {
  const [expanded, setExpanded] = useState(false);
  const all = report.criteria_breakdown ?? [];
  if (all.length === 0) return null;

  const byWeight = [...all].sort((a, b) => b.weight - a.weight);
  const top = byWeight.slice(0, 5);
  const rest = byWeight.slice(5);
  const shown = expanded ? byWeight : top;

  return (
    <Card>
      <CardHeader title="Criteria breakdown" hint="top 5 by weight" />
      <div className="divide-y divide-storm-800">
        {shown.map((c) => (
          <CriterionRow key={c.criterion_id} c={c} />
        ))}
      </div>
      {rest.length > 0 && (
        <div className="border-t border-storm-800 p-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-storm-700 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-storm-300 transition-colors hover:border-signal-cyan/60 hover:text-white"
          >
            {expanded ? (
              <>Collapse ▲</>
            ) : (
              <>Show all {all.length} criteria ▼</>
            )}
          </button>
        </div>
      )}
    </Card>
  );
}

function CriterionRow({ c }: { c: CriterionBreakdown }) {
  const eff = effectiveScore(c);
  const tone = toneFor(eff);
  // Bar width tracks the raw score so barriers visibly read "high friction".
  const width = Math.max(2, Math.round(c.average_score * 100));

  return (
    <div className="px-5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-storm-200">
          {c.label}
          {!c.higher_is_better && (
            <span className="rounded border border-storm-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-storm-400">
              barrier
            </span>
          )}
        </p>
        <div className="flex shrink-0 items-baseline gap-2 font-mono text-xs">
          <span className="text-storm-400">w {pct(c.weight)}</span>
          <span className={`text-sm font-bold ${TONE_TEXT[tone]}`}>{pct(c.average_score)}</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-storm-800">
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            backgroundColor: `rgba(${TONE_RGB[tone]}, 0.85)`,
          }}
        />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-storm-400">{c.interpretation}</p>
    </div>
  );
}
