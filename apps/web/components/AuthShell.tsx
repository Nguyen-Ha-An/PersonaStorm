"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** Centered chrome for the public auth pages (login / signup). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-tunnel flex min-h-screen flex-col">
      <header className="px-5 py-4 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-pulseglow rounded-full bg-signal-cyan opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal-cyan" />
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.22em] text-storm-100">
            PERSONA<span className="text-signal-cyan">STORM</span>
          </span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-4">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
