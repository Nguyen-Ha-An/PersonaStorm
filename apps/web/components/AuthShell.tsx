"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** Centered chrome for the public auth pages (login / signup). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-tunnel flex min-h-screen flex-col">
      <header className="px-5 py-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-storm-950"
        >
          <span className="h-2.5 w-2.5 rounded-[2.5px] bg-accent-primary" aria-hidden />
          <span className="text-sm font-semibold tracking-tight text-storm-100">
            Persona<span className="text-accent-primary">Storm</span>
          </span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-4">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
