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
      <body className="bg-tunnel flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-storm-800/70 bg-storm-950/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-6">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-pulseglow rounded-full bg-signal-cyan opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal-cyan" />
              </span>
              <span className="font-mono text-sm font-bold tracking-[0.22em] text-storm-100">
                PERSONA<span className="text-signal-cyan">STORM</span>
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <span className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-storm-400 sm:block">
                the product wind tunnel
              </span>
              <a
                href="https://github.com/haanmc/personastorm"
                target="_blank"
                rel="noreferrer"
                className="hidden rounded-lg border border-storm-700 px-3 py-1.5 text-xs font-medium text-storm-300 transition hover:border-storm-500 hover:text-storm-100 sm:inline-flex"
              >
                Docs
              </a>
            </div>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="mx-auto w-full max-w-7xl px-5 pb-8 pt-14 sm:px-6">
          <p className="border-t border-storm-800/70 pt-4 text-center text-xs leading-relaxed text-storm-400">
            PersonaStorm generates <span className="text-storm-300">synthetic hypotheses</span> from
            calibrated persona models. It is a pre-research wind tunnel — it does not replace
            talking to real humans, and its personas are not real people.
          </p>
        </footer>
      </body>
    </html>
  );
}
