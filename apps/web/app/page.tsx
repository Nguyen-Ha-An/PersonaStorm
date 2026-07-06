"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import clsx from "clsx";
import { Brand } from "@/components/dashboard/Sidebar";
import { IconReport, IconShield, IconStorm } from "@/components/dashboard/icons";
import { Button, Card, LevelBadge } from "@/components/ui";
import { InsightCard } from "@/components/ui/InsightCard";
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

const CAPABILITIES: {
  title: string;
  tone: "insight" | "success" | "risk";
  icon: JSX.Element;
  body: string;
}[] = [
  {
    title: "Market simulation",
    tone: "insight",
    icon: <IconStorm className="h-4 w-4" />,
    body: "Push a concept, ad, or pricing table through a calibrated swarm of synthetic personas and watch reactions land cell by cell, live.",
  },
  {
    title: "Structured validation report",
    tone: "success",
    icon: <IconReport className="h-4 w-4" />,
    body: "Objections clustered by theme, a price-sensitivity curve, and segment-level adoption — organized so the verdict is obvious before the detail.",
  },
  {
    title: "Honest calibration",
    tone: "risk",
    icon: <IconShield className="h-4 w-4" />,
    body: "Every report ships with a calibration panel — collapse risk, model adherence, and confidence — so you know exactly how much to trust it.",
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Configure",
    body: "Describe your concept, choose a target segment, and pick a persona depth.",
  },
  {
    n: "02",
    title: "Simulate",
    body: "A calibrated persona swarm reacts live — the grid fills in cell by cell as responses arrive.",
  },
  {
    n: "03",
    title: "Validate",
    body: "Read a structured report: adoption forecast, objections, pricing fit, and an honesty check.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  // Logged-in visitors go straight to their dashboard.
  useEffect(() => {
    if (!loading && session) router.replace("/dashboard");
  }, [loading, session, router]);

  return (
    <div className="bg-tunnel flex min-h-screen flex-col">
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
        {/* Hero */}
        <section className="animate-fade-up py-16 text-center sm:py-24">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-storm-400">
            Pre-launch validation
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-storm-100 sm:text-6xl">
            The product wind tunnel.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-storm-300 sm:text-lg">
            Push a concept, landing page, ad, or price through a calibrated swarm of synthetic
            personas — and read the market&rsquo;s reaction before you launch.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button size="lg">Start free — 100 credits</Button>
            </Link>
            <Link href="#how-it-works">
              <Button size="lg" variant="outline">
                See how it works
              </Button>
            </Link>
          </div>
          <p className="mx-auto mt-4 max-w-xl text-xs text-storm-400">
            Synthetic signal, honestly labeled — not a replacement for real research.
          </p>
        </section>

        {/* Product proof: a stylized mock of the live persona grid + report hero */}
        <section className="pb-20">
          <Card className="overflow-hidden p-6 sm:p-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-storm-400">
              Sample report
            </p>
            <div className="mt-5 grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-10">
              {/* mock persona grid */}
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-storm-100">Persona responses</h3>
                  <div className="flex items-center gap-3 text-xs text-storm-400">
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
                  {MOCK_CELLS.map((tone, i) => (
                    <div
                      key={i}
                      aria-hidden="true"
                      className={clsx(
                        "aspect-square rounded-[2px]",
                        tone === "green" && "bg-signal-green/85",
                        tone === "yellow" && "bg-signal-yellow/80",
                        tone === "red" && "bg-signal-red/80",
                        tone === "pending" && "bg-storm-800/70",
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* mock report hero */}
              <div className="border-t border-storm-800 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-storm-400">
                  Market-fit diagnosis
                </p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight text-signal-green sm:text-5xl">
                    78
                  </span>
                  <span className="text-xl font-semibold tracking-tight text-signal-green">%</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-signal-green">
                  Strong market fit signal
                </p>
                <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full border border-storm-700">
                  <div className="bg-signal-green/85" style={{ width: "62%" }} />
                  <div className="bg-signal-yellow/80" style={{ width: "25%" }} />
                  <div className="bg-signal-red/80" style={{ width: "13%" }} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-storm-400">
                  <span>Confidence</span>
                  <LevelBadge level="strong" />
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Capabilities */}
        <section className="grid grid-cols-1 gap-4 pb-20 sm:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <InsightCard key={c.title} title={c.title} tone={c.tone} icon={c.icon}>
              {c.body}
            </InsightCard>
          ))}
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 pb-24">
          <p className="text-center text-[11px] font-medium uppercase tracking-[0.14em] text-storm-400">
            How it works
          </p>
          <h2 className="mt-2 text-center text-base font-semibold tracking-tight text-storm-100 sm:text-lg">
            Three steps from idea to signal
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <Card key={s.n} className="p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-storm-700 text-sm font-semibold text-accent-primary">
                  {s.n}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-storm-100">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-storm-400">{s.body}</p>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-[75rem] px-5 pb-8 sm:px-6">
        <p className="border-t border-storm-800 pt-4 text-center text-xs leading-relaxed text-storm-400">
          PersonaStorm generates <span className="text-storm-300">synthetic hypotheses</span> from
          calibrated persona models. It is a pre-research wind tunnel — it does not replace talking
          to real humans, and its personas are not real people.
        </p>
      </footer>
    </div>
  );
}
