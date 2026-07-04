import { LevelBadge } from "@/components/ui";
import type { StormReport } from "@/lib/types";
import { toneFor, TONE_TEXT } from "./criteria-helpers";

/**
 * The market-fit diagnosis headline. Big overall score + confidence, with the
 * adoption forecast (green/yellow/red split, buy likelihood, market-fit avg)
 * rendered as an instrument-panel readout so the verdict is unmistakable.
 */
export function MarketFitHero({ report }: { report: StormReport }) {
  const overall = report.overall;
  const adoption = report.adoption;
  const total = Math.max(1, adoption.green + adoption.yellow + adoption.red);

  // Guard: types say overall is always present, but be defensive.
  const scoreRaw = overall?.market_fit_score ?? adoption.average_market_fit_score ?? 0;
  const scorePct = Math.round(scoreRaw * 100);
  const tone = toneFor(scoreRaw);
  const confidence = overall?.confidence ?? "medium";

  const verdict =
    scoreRaw >= 0.66
      ? "Strong market fit signal"
      : scoreRaw >= 0.4
        ? "Contested — fit is unproven"
        : "Weak fit — high risk of rejection";

  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div className="relative overflow-hidden rounded-xl border border-storm-700/60 bg-storm-900/80 backdrop-blur-sm">
      {/* radial verdict glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            tone === "green"
              ? "radial-gradient(ellipse 70% 90% at 12% 0%, rgba(52,211,153,0.16), transparent 60%)"
              : tone === "yellow"
                ? "radial-gradient(ellipse 70% 90% at 12% 0%, rgba(251,191,36,0.15), transparent 60%)"
                : "radial-gradient(ellipse 70% 90% at 12% 0%, rgba(251,113,133,0.16), transparent 60%)",
        }}
      />

      <div className="relative grid gap-6 p-6 lg:grid-cols-[minmax(230px,300px)_1fr] lg:gap-8 lg:p-8">
        {/* score */}
        <div className="flex flex-col justify-center border-b border-storm-800 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-storm-400">
            market-fit diagnosis
          </p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={`text-7xl font-bold leading-none ${TONE_TEXT[tone]}`}>
              {scorePct}
            </span>
            <span className={`text-3xl font-bold ${TONE_TEXT[tone]}`}>%</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-white">{verdict}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-storm-400">
              confidence
            </span>
            <LevelBadge level={confidence} />
          </div>
          {report.product_category && (
            <p className="mt-3 font-mono text-[11px] text-storm-400">
              category · {report.product_category}
            </p>
          )}
        </div>

        {/* adoption forecast */}
        <div className="flex flex-col justify-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-storm-400">
            adoption forecast · {total.toLocaleString()} personas
          </p>

          {/* stacked bar */}
          <div className="mt-3 flex h-5 w-full overflow-hidden rounded-full border border-storm-700">
            <div
              className="bg-signal-green/85"
              style={{ width: `${(adoption.green / total) * 100}%` }}
              title={`likely: ${adoption.green}`}
            />
            <div
              className="bg-signal-yellow/80"
              style={{ width: `${(adoption.yellow / total) * 100}%` }}
              title={`unsure: ${adoption.yellow}`}
            />
            <div
              className="bg-signal-red/80"
              style={{ width: `${(adoption.red / total) * 100}%` }}
              title={`unlikely: ${adoption.red}`}
            />
          </div>

          {/* forecast readouts */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Readout label="likely" value={`${adoption.green}`} sub={`${pct(adoption.green)}%`} tone="green" />
            <Readout label="unsure" value={`${adoption.yellow}`} sub={`${pct(adoption.yellow)}%`} tone="yellow" />
            <Readout label="unlikely" value={`${adoption.red}`} sub={`${pct(adoption.red)}%`} tone="red" />
            <Readout
              label="avg buy likelihood"
              value={`${Math.round(adoption.average_buy_likelihood * 100)}%`}
            />
            <Readout
              label="avg market fit"
              value={`${Math.round(adoption.average_market_fit_score * 100)}%`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Readout({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "yellow" | "red";
}) {
  const color =
    tone === "green"
      ? "text-signal-green"
      : tone === "yellow"
        ? "text-signal-yellow"
        : tone === "red"
          ? "text-signal-red"
          : "text-white";
  return (
    <div className="rounded-lg border border-storm-800 bg-storm-850 px-3 py-2.5">
      <p className="text-[9px] uppercase leading-tight tracking-wider text-storm-400">{label}</p>
      <p className={`mt-1 font-mono text-lg font-bold leading-none ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[10px] text-storm-400">{sub}</p>}
    </div>
  );
}
