"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";

const FEATURES: [string, string][] = [
  ["Objection radar", "Clustered themes ranked by frequency, per segment."],
  ["Price sensitivity", "A demand curve from thousands of stated willingness-to-pay points."],
  ["Trust panel", "Collapse risk, adherence & grounding shown on every report."],
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
      <header className="sticky top-0 z-30 border-b border-storm-800/70 bg-storm-950/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-pulseglow rounded-full bg-signal-cyan opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal-cyan" />
            </span>
            <span className="font-mono text-sm font-bold tracking-[0.22em] text-storm-100">
              PERSONA<span className="text-signal-cyan">STORM</span>
            </span>
          </div>
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 sm:px-6">
        <section className="animate-fade-up py-16 text-center sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-storm-700 bg-storm-900/60 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-storm-300">
            <span className="h-1.5 w-1.5 rounded-full bg-signal-cyan" />
            calibrated persona swarm · live objection radar
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight text-storm-100 sm:text-6xl">
            Test the market
            <span className="text-signal-cyan"> before you build it.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-storm-300">
            PersonaStorm is the product wind tunnel. Paste a concept, landing page, ad, or pricing
            table — a synthetic persona swarm reacts live, then produces a market-evaluation
            dashboard surfacing objections, price resistance, and segment risk
            <em className="text-storm-200"> before</em> you spend on surveys, ads, or launches.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button size="lg">Start free — 100 credits</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                Log in
              </Button>
            </Link>
          </div>
          <p className="mx-auto mt-4 max-w-xl text-xs text-storm-400">
            Synthetic signal, honestly labeled — not a replacement for real research.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-3 pb-20 sm:grid-cols-3">
          {FEATURES.map(([t, d]) => (
            <div key={t} className="rounded-xl border border-storm-800 bg-storm-900/50 px-4 py-4">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-signal-cyan">
                {t}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-storm-400">{d}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-5 pb-8 sm:px-6">
        <p className="border-t border-storm-800/70 pt-4 text-center text-xs leading-relaxed text-storm-400">
          PersonaStorm generates <span className="text-storm-300">synthetic hypotheses</span> from
          calibrated persona models. It is a pre-research wind tunnel — it does not replace talking
          to real humans, and its personas are not real people.
        </p>
      </footer>
    </div>
  );
}
