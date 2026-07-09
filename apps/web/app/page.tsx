"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import clsx from "clsx";
import { Brand } from "@/components/dashboard/Sidebar";
import { Button, Card, LevelBadge } from "@/components/ui";
import { useAuth } from "@/lib/auth";

// Deterministic (no Math.random — avoids any SSR/CSR hydration mismatch) mock
// distribution for the "product proof" sensor grid: mostly adopts, a scatter
// of unsure/rejects, and a couple of cells still "pending" for a live feel.
type MockTone = "green" | "yellow" | "red" | "pending";
const MOCK_CELLS: MockTone[] = Array.from({ length: 60 }, (_, i): MockTone => {
  const v = (i * 37) % 100;
  if (v < 58) return "green";
  if (v < 82) return "yellow";
  if (v < 94) return "red";
  return "pending";
});

const TONE_CLASS: Record<MockTone, string> = {
  green: "bg-signal-green/85",
  yellow: "bg-signal-yellow/80",
  red: "bg-signal-red/80",
  pending: "bg-storm-800/70",
};

const STEPS: { title: string; body: string }[] = [
  {
    title: "Configure",
    body: "Describe your concept, choose a target segment, and pick a persona depth.",
  },
  {
    title: "Simulate",
    body: "A calibrated persona swarm reacts live. The grid fills in cell by cell as responses arrive.",
  },
  {
    title: "Validate",
    body: "Read a structured report: adoption forecast, objections, pricing fit, and an honesty check.",
  },
];

/** Entry cascade for the hero; static under prefers-reduced-motion. */
function fadeUp(delayMs: number) {
  return {
    className: "animate-fade-up motion-reduce:animate-none",
    style: { animationDelay: `${delayMs}ms` },
  };
}

function SwarmCells({ cells }: { cells: MockTone[] }) {
  return (
    <>
      {cells.map((tone, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={clsx("aspect-square rounded-[2px]", TONE_CLASS[tone])}
        />
      ))}
    </>
  );
}

function AdoptionBar({ className }: { className?: string }) {
  return (
    <div
      className={clsx("flex overflow-hidden rounded-full border border-storm-700", className)}
      role="img"
      aria-label="Adoption split: 62 percent adopts, 25 percent unsure, 13 percent rejects"
    >
      <div className="bg-signal-green/85" style={{ width: "62%" }} />
      <div className="bg-signal-yellow/80" style={{ width: "25%" }} />
      <div className="bg-signal-red/80" style={{ width: "13%" }} />
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  // Logged-in visitors go straight to their dashboard.
  useEffect(() => {
    if (!loading && session) router.replace("/dashboard");
  }, [loading, session, router]);

  return (
    <div className="bg-tunnel flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-20 border-b border-storm-800 bg-storm-950/80 px-5 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex w-full max-w-[75rem] items-center justify-between">
          <Brand />
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[75rem] flex-1 px-5 sm:px-6">
        {/* Hero: asymmetric split — copy left, the product's own report UI right */}
        <section className="py-14 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <div>
              <h1
                {...fadeUp(0)}
                className={clsx(
                  fadeUp(0).className,
                  "text-4xl font-semibold leading-[1.06] tracking-tight text-storm-100 sm:text-5xl lg:text-6xl",
                )}
              >
                The product wind tunnel.
              </h1>
              <p
                {...fadeUp(110)}
                className={clsx(
                  fadeUp(110).className,
                  "mt-5 max-w-xl text-[17px] leading-relaxed text-storm-300",
                )}
              >
                Push a concept, ad, or price through a calibrated swarm of synthetic personas and
                read the market before you launch.
              </p>
              <div
                {...fadeUp(170)}
                className={clsx(fadeUp(170).className, "mt-8 flex flex-wrap items-center gap-3")}
              >
                <Link href="/demo">
                  <Button size="lg">▶ Watch a 60-second live demo</Button>
                </Link>
                <Link href="#how-it-works">
                  <Button size="lg" variant="outline">
                    See how it works
                  </Button>
                </Link>
              </div>
              <p
                {...fadeUp(210)}
                className={clsx(fadeUp(210).className, "mt-3 text-sm text-storm-400")}
              >
                No signup — watch a real 1,000-persona run stream live, then read the full report.
              </p>
            </div>

            {/* Real component preview: same UI language as the live report */}
            <Card {...fadeUp(230)} className={clsx(fadeUp(230).className, "p-6")}>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-storm-300">
                Illustrative sample
              </p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-storm-100">Persona responses</h3>
                <div className="flex items-center gap-3 text-xs text-storm-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-signal-green" aria-hidden="true" />
                    Adopts
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-signal-yellow" aria-hidden="true" />
                    Unsure
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-signal-red" aria-hidden="true" />
                    Rejects
                  </span>
                </div>
              </div>
              <div
                className="mt-4 grid grid-cols-10 gap-1 sm:grid-cols-12"
                role="img"
                aria-label="Illustrative persona swarm grid, mostly adopting with some unsure and rejecting"
              >
                <SwarmCells cells={MOCK_CELLS} />
              </div>
              <div className="mt-6 border-t border-storm-800 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-storm-300">
                  Market-fit diagnosis
                </p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight text-signal-green">78</span>
                  <span className="text-xl font-semibold tracking-tight text-signal-green">%</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-signal-green">
                  Strong market fit signal
                </p>
                <AdoptionBar className="mt-4 h-4 w-full" />
                <div className="mt-3 flex items-center gap-2 text-xs text-storm-300">
                  <span>Confidence</span>
                  <LevelBadge level="strong" />
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Honesty strip: the brand voice, promoted out of the hero */}
        <section className="border-y border-storm-800 py-12">
          <p className="max-w-3xl text-[22px] font-semibold leading-snug tracking-tight text-storm-100">
            Synthetic signal, <span className="text-accent-primary">honestly labeled</span>.
          </p>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-storm-300">
            PersonaStorm is a pre-research wind tunnel. It sharpens what you take into real
            research; it never replaces talking to real humans.
          </p>
        </section>

        {/* Capabilities: asymmetric bento (2 + 1 + full-width), product-data motifs */}
        <section className="pt-20">
          <h2 className="text-[28px] font-semibold tracking-tight text-storm-100">
            Built to pressure-test ideas
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Card className="relative min-h-[13rem] overflow-hidden p-7 md:col-span-2">
              <h3 className="text-[15px] font-semibold text-storm-100">Market simulation</h3>
              <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-storm-300">
                Push a concept, ad, or pricing table through a calibrated swarm of synthetic
                personas and watch reactions land cell by cell, live.
              </p>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-5 -right-4 grid w-[55%] grid-cols-10 gap-[3px] opacity-50"
              >
                <SwarmCells cells={MOCK_CELLS.slice(0, 30)} />
              </div>
            </Card>

            <Card className="p-7">
              <h3 className="text-[15px] font-semibold text-storm-100">
                Structured validation report
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-storm-300">
                Objections clustered by theme, a price-sensitivity curve, and segment-level
                adoption, organized so the verdict is obvious before the detail.
              </p>
              <AdoptionBar className="mt-5 h-2.5 w-full max-w-[14rem]" />
            </Card>

            <Card className="grid items-center gap-8 p-7 md:col-span-3 md:grid-cols-[1.2fr_1fr]">
              <div>
                <h3 className="text-[15px] font-semibold text-storm-100">Honest calibration</h3>
                <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-storm-300">
                  Every report ships with a calibration panel covering collapse risk, model
                  adherence, and confidence, so you know exactly how much to trust it.
                </p>
              </div>
              <div className="flex flex-col gap-3" aria-hidden="true">
                <div className="grid grid-cols-[8.5rem_auto] items-center gap-3 text-xs text-storm-300">
                  <span>Collapse risk</span>
                  <LevelBadge level="low" className="w-fit" />
                </div>
                <div className="grid grid-cols-[8.5rem_auto] items-center gap-3 text-xs text-storm-300">
                  <span>Model adherence</span>
                  <span className="inline-flex w-fit items-center rounded-full border border-accent-primary/40 bg-accent-primary/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-accent-primary">
                    0.86
                  </span>
                </div>
                <div className="grid grid-cols-[8.5rem_auto] items-center gap-3 text-xs text-storm-300">
                  <span>Confidence</span>
                  <LevelBadge level="strong" className="w-fit" />
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* How it works: definition rows, anchor preserved */}
        <section id="how-it-works" className="scroll-mt-20 pt-20">
          <h2 className="text-[28px] font-semibold tracking-tight text-storm-100">
            Three steps from idea to signal
          </h2>
          <div className="mt-6">
            {STEPS.map((s) => (
              <div
                key={s.title}
                className="grid gap-1.5 border-t border-storm-800 py-5 md:grid-cols-[11rem_1fr] md:gap-6"
              >
                <h3 className="text-[15px] font-semibold text-storm-100">{s.title}</h3>
                <p className="max-w-2xl text-sm leading-relaxed text-storm-300">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA: the page no longer dead-ends after how-it-works */}
        <section className="py-20">
          <Card className="flex flex-wrap items-center justify-between gap-8 bg-[radial-gradient(38rem_16rem_at_12%_-6rem,rgba(53,199,217,0.07),transparent_70%)] p-7 sm:p-10">
            <div>
              <h2 className="text-[26px] font-semibold tracking-tight text-storm-100">
                Read the market before you launch.
              </h2>
              <p className="mt-2 text-[15px] text-storm-300">
                Sign up and get 240 free credits for your first simulations.
              </p>
            </div>
            <Link href="/signup">
              <Button size="lg">Get started</Button>
            </Link>
          </Card>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-[75rem] px-5 pb-8 sm:px-6">
        <p className="border-t border-storm-800 pt-4 text-center text-xs leading-relaxed text-storm-300">
          PersonaStorm generates <span className="text-storm-200">synthetic hypotheses</span> from
          calibrated persona models. It is a pre-research wind tunnel. It does not replace talking
          to real humans, and its personas are not real people.
        </p>
      </footer>
    </div>
  );
}
