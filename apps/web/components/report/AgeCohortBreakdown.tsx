import { Card, CardHeader } from "@/components/ui";
import type { AgeCohortReport, StormReport } from "@/lib/types";
import { formatNumberCompact, formatPercent } from "@/lib/format";
import { toneFor, TONE_TEXT } from "./criteria-helpers";

/**
 * Adoption by life stage. Only cohorts actually present in the run render.
 * Each card surfaces adoption_rate, avg market-fit, the top barrier, and the
 * qualitative insight.
 */
export function AgeCohortBreakdown({ report }: { report: StormReport }) {
  const cohorts = report.age_cohorts ?? [];
  if (cohorts.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Adoption by life stage" hint={`${cohorts.length} cohorts`} />
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {cohorts.map((c) => (
          <CohortCard key={c.life_stage} c={c} />
        ))}
      </div>
    </Card>
  );
}

function CohortCard({ c }: { c: AgeCohortReport }) {
  const tone = toneFor(c.avg_market_fit_score);
  return (
    <div className="flex flex-col rounded-lg border border-storm-800 bg-storm-850 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-storm-100">{c.life_stage}</p>
        <span className="text-xs text-storm-400">{formatNumberCompact(c.personas)} personas</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-storm-400">Adoption</p>
          <p className={`text-xl font-semibold ${TONE_TEXT[toneFor(c.adoption_rate)]}`}>
            {formatPercent(c.adoption_rate)}
          </p>
        </div>
        <div>
          <p className="text-xs text-storm-400">Market fit</p>
          <p className={`text-xl font-semibold ${TONE_TEXT[tone]}`}>{formatPercent(c.avg_market_fit_score)}</p>
        </div>
      </div>
      <div className="mt-3 border-t border-storm-800 pt-2.5">
        <p className="text-xs font-medium text-signal-red">Top barrier</p>
        <p className="mt-0.5 text-xs leading-snug text-storm-200">{c.top_barrier}</p>
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-storm-400">{c.insight}</p>
    </div>
  );
}
