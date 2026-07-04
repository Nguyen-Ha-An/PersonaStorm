"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

/**
 * Auth guard for every dashboard route. Logged-out users are redirected to
 * /login (with a `next` param so they return here after signing in). The
 * backend independently enforces auth on every endpoint — this guard is UX,
 * not the security boundary.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
    }
  }, [loading, session, router, pathname]);

  if (loading || !session) {
    return (
      <div className="bg-tunnel flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-pulseglow rounded-full bg-signal-cyan opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-signal-cyan" />
          </span>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-storm-400">
            {loading ? "loading…" : "redirecting…"}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
