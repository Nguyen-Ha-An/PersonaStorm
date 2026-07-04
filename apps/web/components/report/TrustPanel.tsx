import { Card, CardHeader, LevelBadge } from "@/components/ui";
import type { StormReport } from "@/lib/types";

/**
 * The honesty panel. Every metric that could tell a user "don't trust this
 * run" is displayed with equal visual weight to the flattering ones.
 */
export function TrustPanel({ report }: { report: StormReport }) {
  const q = report.quality;

  const scoreTiles: { label: string; value: string; good: boolean; hint: string }[] = [
    {
      label: "persona adherence",
      value: q.persona_adherence.toFixed(2),
      good: q.persona_adherence >= 0.6,
      hint: "do reactions follow persona traits? (trait↔behavior correlation)",
    },
    {
      label: "product grounding",
      value: q.product_grounding.toFixed(2),
      good: q.product_grounding >= 0.6,
      hint: "share of reactions referencing your actual stimulus",
    },
    {
      label: "generic response rate",
      value: `${Math.round(q.generic_response_rate * 100)}%`,
      good: q.generic_response_rate <= 0.1,
      hint: "vague filler like “seems useful” — lower is better",
    },
    {
      label: "duplicate rate",
      value: `${Math.round(q.duplicate_objection_rate * 100)}%`,
      good: q.duplicate_objection_rate <= 0.3,
      hint: "near-verbatim repeated outputs — lower is better",
    },
  ];

  const levelTiles: { label: string; level: string; invert?: boolean; hint: string }[] = [
    {
      label: "objection entropy",
      level: q.objection_entropy,
      hint: "diversity of objection themes",
    },
    {
      label: "segment variance",
      level: q.segment_variance,
      hint: "do segments react differently? (they should)",
    },
    {
      label: "collapse risk",
      level: q.collapse_risk,
      invert: true,
      hint: "is the swarm mode-collapsing into one voice?",
    },
    {
      label: "benchmark confidence",
      level: q.benchmark_confidence,
      hint: q.benchmark_category
        ? `reference data for “${q.benchmark_category}”`
        : "reference data for this category",
    },
  ];

  return (
    <Card>
      <CardHeader title="Trust / calibration panel" hint="read this before believing anything above" />
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {scoreTiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-storm-800 bg-storm-850 p-4">
            <p className="text-[10px] uppercase tracking-wider text-storm-400">{t.label}</p>
            <p
              className={`mt-1 font-mono text-2xl font-bold ${
                t.good ? "text-signal-green" : "text-signal-yellow"
              }`}
            >
              {t.value}
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-storm-400">{t.hint}</p>
          </div>
        ))}
        {levelTiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-storm-800 bg-storm-850 p-4">
            <p className="text-[10px] uppercase tracking-wider text-storm-400">{t.label}</p>
            <div className="mt-1.5">
              <LevelBadge level={t.level} invert={t.invert} />
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-storm-400">{t.hint}</p>
          </div>
        ))}
      </div>
      {q.notes.length > 0 && (
        <div className="border-t border-storm-800 px-5 py-3">
          {q.notes.map((n) => (
            <p key={n} className="text-xs leading-relaxed text-storm-400">
              · {n}
            </p>
          ))}
        </div>
      )}
      <div className="border-t border-storm-800 bg-storm-850/50 px-5 py-3">
        <p className="text-xs leading-relaxed text-storm-300">{report.disclaimer}</p>
      </div>
    </Card>
  );
}
