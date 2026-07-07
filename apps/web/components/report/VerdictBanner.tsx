import clsx from "clsx";
import type { Verdict } from "@/lib/types";

const LEVEL: Record<Verdict["level"], { text: string; ring: string; wash: string }> = {
  strong: {
    text: "text-signal-green",
    ring: "border-signal-green/30",
    wash: "radial-gradient(ellipse 80% 100% at 10% 0%, rgba(76,195,138,0.16), transparent 60%)",
  },
  conditional: {
    text: "text-signal-yellow",
    ring: "border-signal-yellow/30",
    wash: "radial-gradient(ellipse 80% 100% at 10% 0%, rgba(214,168,79,0.15), transparent 60%)",
  },
  weak: {
    text: "text-signal-red",
    ring: "border-signal-red/30",
    wash: "radial-gradient(ellipse 80% 100% at 10% 0%, rgba(239,106,122,0.16), transparent 60%)",
  },
};

/**
 * The verdict-first headline: one decisive call (strong / conditional / weak)
 * with a one-line rationale. When the run is low-confidence or collapse risk is
 * non-low, an amber "Directional only" pill is layered OVER (not replacing) the
 * level color, so the headline stays honest.
 */
export function VerdictBanner({ verdict }: { verdict: Verdict }) {
  const style = LEVEL[verdict.level];
  return (
    <div
      data-tour="verdict-banner"
      className={clsx(
        "relative overflow-hidden rounded-2xl border bg-storm-900 p-6 shadow-panel sm:p-8",
        style.ring,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-80" style={{ background: style.wash }} />
      <div className="relative">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-storm-400">The verdict</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className={clsx("text-2xl font-semibold tracking-tight sm:text-3xl", style.text)}>
            {verdict.headline}
          </h2>
          {verdict.caveated ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-signal-yellow/40 bg-signal-yellow/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-signal-yellow">
              <span aria-hidden>⚠</span> Directional only — low confidence
            </span>
          ) : null}
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-storm-200">{verdict.rationale}</p>
      </div>
    </div>
  );
}
