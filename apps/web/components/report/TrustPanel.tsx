import clsx from "clsx";
import { Card, CardHeader, LevelBadge } from "@/components/ui";
import type { StormReport } from "@/lib/types";
import { formatPercent } from "@/lib/format";

/**
 * The honesty strip. Every metric that could tell a user "don't trust this
 * run" is displayed with equal visual weight to the flattering ones — kept
 * compact and placed right under the hero so it's read first, not buried.
 */
export function TrustPanel({ report }: { report: StormReport }) {
  const q = report.quality;

  const scoreTiles: { label: string; value: string; good: boolean; hint: string }[] = [
    {
      label: "Persona adherence",
      value: q.persona_adherence.toFixed(2),
      good: q.persona_adherence >= 0.6,
      hint: "do reactions follow persona traits?",
    },
    {
      label: "Product grounding",
      value: q.product_grounding.toFixed(2),
      good: q.product_grounding >= 0.6,
      hint: "share of reactions referencing your stimulus",
    },
    {
      label: "Generic response rate",
      value: formatPercent(q.generic_response_rate),
      good: q.generic_response_rate <= 0.1,
      hint: "vague filler like “seems useful” — lower is better",
    },
    {
      label: "Duplicate rate",
      value: formatPercent(q.duplicate_objection_rate),
      good: q.duplicate_objection_rate <= 0.3,
      hint: "near-verbatim repeated outputs — lower is better",
    },
  ];

  const levelTiles: { label: string; level: string; invert?: boolean; hint: string }[] = [
    {
      label: "Objection entropy",
      level: q.objection_entropy,
      hint: "diversity of objection themes",
    },
    {
      label: "Segment variance",
      level: q.segment_variance,
      hint: "do segments react differently?",
    },
    {
      label: "Collapse risk",
      level: q.collapse_risk,
      hint: "is the swarm mode-collapsing into one voice?",
    },
    {
      label: "Benchmark confidence",
      level: q.benchmark_confidence,
      hint: q.benchmark_category ? `reference data for “${q.benchmark_category}”` : "reference data for this category",
    },
  ];

  return (
    <Card>
      <CardHeader title="Calibration & confidence" hint="read this before believing anything above" />
      <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-4 lg:grid-cols-8">
        {scoreTiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-storm-800 bg-storm-850 px-3 py-2.5">
            <p className="text-xs text-storm-400">{t.label}</p>
            <p className={clsx("mt-1 text-lg font-semibold", t.good ? "text-signal-green" : "text-signal-yellow")}>
              {t.value}
              <span className="ml-1.5 align-middle text-[10px] font-medium text-storm-400">
                {t.good ? "OK" : "low"}
              </span>
            </p>
            <p className="mt-1 text-[11px] leading-snug text-storm-400">{t.hint}</p>
          </div>
        ))}
        {levelTiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-storm-800 bg-storm-850 px-3 py-2.5">
            <p className="text-xs text-storm-400">{t.label}</p>
            <div className="mt-1">
              <LevelBadge level={t.level} invert={t.invert} />
            </div>
            <p className="mt-1 text-[11px] leading-snug text-storm-400">{t.hint}</p>
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
      {report.calibration_evidence && (
        <div className="border-t border-storm-800 px-5 py-3">
          <h4 className="text-sm font-semibold text-storm-100">Calibration evidence</h4>
          <p className="mt-1.5 text-xs leading-relaxed text-storm-400">
            Trait priors: {Math.round(report.calibration_evidence.priors_coverage * 100)}% sourced
            {report.calibration_evidence.priors_source === "embedded_unverified" &&
              " (embedded defaults — unvalidated)"}
          </p>
          {report.calibration_evidence.assumptions_fired.length > 0 && (
            <ul className="mt-1.5">
              {report.calibration_evidence.assumptions_fired.map((a) => (
                <li key={a.id} className="text-xs leading-relaxed text-storm-400">
                  · {a.id} ({a.evidence_status}) — {a.personas_affected} personas
                </li>
              ))}
            </ul>
          )}
          {report.calibration_evidence.counterfactual_audit && (
            <p className="mt-1.5 text-xs leading-relaxed text-storm-400">
              Counterfactual audit: {report.calibration_evidence.counterfactual_audit.status}
              {(report.calibration_evidence.counterfactual_audit.pairs_not_applicable ?? 0) > 0 &&
                ` (${report.calibration_evidence.counterfactual_audit.pairs_not_applicable} pairs not applicable in this provider)`}
            </p>
          )}
          <p className="mt-1.5 text-xs text-storm-400">
            Semantic grounding: {report.calibration_evidence.semantic_source === "fallback_formulas"
              ? "formula fallback (not LLM-grounded)"
              : report.calibration_evidence.semantic_source}
          </p>
          {report.calibration_evidence.confidence_downgrades.map((d) => (
            <p key={d} className="mt-1.5 text-xs leading-relaxed text-signal-yellow">
              ⚠ {d}
            </p>
          ))}
        </div>
      )}
      <div className="border-t border-storm-800 bg-storm-900/40 px-5 py-3">
        <p className="text-xs leading-relaxed text-storm-300">{report.disclaimer}</p>
      </div>
    </Card>
  );
}
