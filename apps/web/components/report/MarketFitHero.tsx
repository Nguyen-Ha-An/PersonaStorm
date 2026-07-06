import clsx from "clsx";
import { LevelBadge } from "@/components/ui";
import type { StormReport } from "@/lib/types";
import { formatNumberCompact, formatPercent, formatScore } from "@/lib/format";
import { toneFor, TONE_TEXT, type ScoreTone } from "./criteria-helpers";

const WASH: Record<ScoreTone, string> = {
  green: "radial-gradient(ellipse 70% 90% at 12% 0%, rgba(76,195,138,0.16), transparent 60%)",
  yellow: "radial-gradient(ellipse 70% 90% at 12% 0%, rgba(214,168,79,0.15), transparent 60%)",
  red: "radial-gradient(ellipse 70% 90% at 12% 0%, rgba(239,106,122,0.16), transparent 60%)",
};

/**
 * The market-fit diagnosis headline. One large score + confidence, with the
 * adoption forecast (green/yellow/red split, buy likelihood, market-fit avg)
 * rendered as a calm instrument-panel readout so the verdict is unmistakable.
 */
export function MarketFitHero({ report }: { report: StormReport }) {
  const overall = report.overall;
  const adoption = report.adoption;
  const total = Math.max(1, adoption.green + adoption.yellow + adoption.red);

  // Guard: types say overall is always present, but be defensive.
  const scoreRaw = overall?.market_fit_score ?? adoption.average_market_fit_score ?? 0;
  const tone = toneFor(scoreRaw);
  const confidence = overall?.confidence ?? "medium";

  const verdict =
    tone === "green"
      ? "Strong market fit signal"
      : tone === "yellow"
        ? "Contested — fit is unproven"
        : "Weak fit — high risk of rejection";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-storm-700 bg-storm-900 p-6 shadow-panel sm:p-8">
      {/* subtle verdict wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: WASH[tone] }}
      />

      <div className="relative grid gap-8 lg:grid-cols-[minmax(230px,300px)_1fr] lg:gap-10">
        {/* score */}
        <div className="flex flex-col justify-center border-b border-storm-800 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-storm-400">
            Market-fit diagnosis
          </p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={clsx("text-4xl font-semibold tracking-tight sm:text-5xl", TONE_TEXT[tone])}>
              {formatScore(scoreRaw)}
            </span>
            <span className={clsx("text-2xl font-semibold tracking-tight", TONE_TEXT[tone])}>%</span>
          </div>
          <p className={clsx("mt-3 text-sm font-semibold leading-snug", TONE_TEXT[tone])}>{verdict}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs font-medium text-storm-400">Confidence</span>
            <LevelBadge level={confidence} />
          </div>
          {report.product_category && (
            <p className="mt-3 text-xs text-storm-400">Category — {report.product_category}</p>
          )}
        </div>

        {/* adoption forecast */}
        <div className="flex flex-col justify-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-storm-400">
            Adoption forecast · {formatNumberCompact(total)} personas
          </p>

          {/* stacked bar */}
          <div className="mt-3 flex h-5 w-full overflow-hidden rounded-full border border-storm-700">
            <div
              className="bg-signal-green/85"
              style={{ width: `${(adoption.green / total) * 100}%` }}
              title={`Likely: ${adoption.green}`}
            />
            <div
              className="bg-signal-yellow/80"
              style={{ width: `${(adoption.yellow / total) * 100}%` }}
              title={`Unsure: ${adoption.yellow}`}
            />
            <div
              className="bg-signal-red/80"
              style={{ width: `${(adoption.red / total) * 100}%` }}
              title={`Unlikely: ${adoption.red}`}
            />
          </div>

          {/* forecast readouts */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Readout
              label="Likely"
              value={formatNumberCompact(adoption.green)}
              sub={formatPercent(adoption.green / total)}
              tone="green"
            />
            <Readout
              label="Unsure"
              value={formatNumberCompact(adoption.yellow)}
              sub={formatPercent(adoption.yellow / total)}
              tone="yellow"
            />
            <Readout
              label="Unlikely"
              value={formatNumberCompact(adoption.red)}
              sub={formatPercent(adoption.red / total)}
              tone="red"
            />
            <Readout label="Avg. buy likelihood" value={formatPercent(adoption.average_buy_likelihood)} />
            <Readout label="Avg. market fit" value={formatPercent(adoption.average_market_fit_score)} />
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
          : "text-storm-100";
  return (
    <div className="rounded-lg border border-storm-800 bg-storm-850 px-3 py-2.5">
      <p className="text-[11px] leading-tight text-storm-400">{label}</p>
      <p className={clsx("mt-1 text-lg font-semibold leading-none", color)}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-storm-400">{sub}</p>}
    </div>
  );
}
