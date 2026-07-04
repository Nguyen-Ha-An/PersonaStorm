import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PersonaStorm — The product wind tunnel",
  description:
    "Run your product concept, ad, pricing, or landing page through a calibrated swarm of 1,000 synthetic personas before spending money on real research.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-tunnel min-h-screen">
        <header className="border-b border-storm-800/80">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-pulseglow rounded-full bg-signal-cyan opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-signal-cyan" />
              </span>
              <span className="font-mono text-sm font-bold tracking-[0.22em] text-white">
                PERSONA<span className="text-signal-cyan">STORM</span>
              </span>
            </Link>
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-storm-400 sm:block">
              the product wind tunnel
            </span>
          </div>
        </header>
        {children}
        <footer className="mx-auto max-w-7xl px-6 pb-8 pt-12">
          <p className="border-t border-storm-800/80 pt-4 text-center text-xs leading-relaxed text-storm-400">
            PersonaStorm generates <span className="text-storm-300">synthetic hypotheses</span> from
            calibrated persona models. It is a pre-research wind tunnel — it does not replace
            talking to real humans, and its personas are not real people.
          </p>
        </footer>
      </body>
    </html>
  );
}
