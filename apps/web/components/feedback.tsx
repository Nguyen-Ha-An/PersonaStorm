"use client";

/**
 * Shared feedback surfaces: inline alerts, the API-configuration banner, and
 * full-panel error / empty states. These exist so no screen ever falls back to
 * a bare "Failed to fetch" — every failure names its cause and a way forward.
 */

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Card } from "@/components/ui";
import { checkBackendHealth, type BackendHealth } from "@/lib/api";

type AlertTone = "red" | "yellow" | "cyan";

const ALERT_TONES: Record<AlertTone, { wrap: string; icon: string; title: string }> = {
  red: {
    wrap: "border-signal-red/40 bg-signal-red/10",
    icon: "text-signal-red",
    title: "text-signal-red",
  },
  yellow: {
    wrap: "border-signal-yellow/40 bg-signal-yellow/10",
    icon: "text-signal-yellow",
    title: "text-signal-yellow",
  },
  cyan: {
    wrap: "border-signal-cyan/40 bg-signal-cyan/10",
    icon: "text-signal-cyan",
    title: "text-signal-cyan",
  },
};

function AlertGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={clsx("h-5 w-5 shrink-0", className)} aria-hidden>
      <path
        d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Inline banner alert. Renders a title, message, optional detail + actions. */
export function Alert({
  tone = "red",
  title,
  children,
  detail,
  actions,
  className,
}: {
  tone?: AlertTone;
  title: ReactNode;
  children?: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const t = ALERT_TONES[tone];
  return (
    <div
      role="alert"
      className={clsx("flex gap-3 rounded-xl border px-4 py-3.5 text-sm", t.wrap, className)}
    >
      <AlertGlyph className={t.icon} />
      <div className="min-w-0 flex-1">
        <p className={clsx("font-semibold", t.title)}>{title}</p>
        {children ? <div className="mt-1 leading-relaxed text-storm-200">{children}</div> : null}
        {detail ? (
          <p className="mt-2 break-all font-mono text-xs text-storm-400">{detail}</p>
        ) : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/**
 * Banner shown when the backend proxy reports the FastAPI backend is not
 * configured or unreachable. Unlike the old build-time NEXT_PUBLIC_API_BASE
 * check, the browser has no way to know this statically anymore — the real
 * backend address is a server-only secret (BACKEND_API_BASE) — so this probes
 * the same-origin health proxy once on mount. Renders nothing while checking
 * or once healthy, so it never flashes on a working deployment.
 */
export function ApiConfigAlert() {
  const [health, setHealth] = useState<BackendHealth | "checking">("checking");

  useEffect(() => {
    let cancelled = false;
    checkBackendHealth().then((h) => {
      if (!cancelled) setHealth(h);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (health === "checking" || health === "ok") return null;

  return (
    <Alert tone="yellow" title="PersonaStorm backend is not configured or unreachable">
      {health === "unavailable" ? (
        <>
          The FastAPI backend hasn&rsquo;t been deployed yet, or{" "}
          <span className="font-mono text-storm-100">BACKEND_API_BASE</span> isn&rsquo;t set. If
          deployed, set <span className="font-mono text-storm-100">BACKEND_API_BASE</span> in
          Vercel (or your host&rsquo;s environment variables) to the backend&rsquo;s URL. For local
          development, run FastAPI on <span className="font-mono text-storm-100">http://localhost:8000</span>.
        </>
      ) : (
        <>
          The backend didn&rsquo;t respond. Verify it is running and reachable, and that{" "}
          <span className="font-mono text-storm-100">BACKEND_API_BASE</span> is correct.
        </>
      )}{" "}
      Login, signup, and the dashboard still work — only storm/billing/admin actions need the
      backend.
    </Alert>
  );
}

/** Full-panel error state with a message, optional detail, and recovery actions. */
export function ErrorState({
  title = "Something went wrong",
  message,
  detail,
  onRetry,
  homeHref = "/",
  homeLabel = "Back to home",
}: {
  title?: ReactNode;
  message: ReactNode;
  detail?: ReactNode;
  onRetry?: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <Card className="mx-auto max-w-xl p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-signal-red/40 bg-signal-red/10">
        <AlertGlyph className="text-signal-red" />
      </div>
      <h2 className="text-lg font-semibold text-storm-100">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-storm-300">{message}</p>
      {detail ? (
        <p className="mx-auto mt-3 max-w-md break-all rounded-lg border border-storm-800 bg-storm-850 px-3 py-2 font-mono text-xs text-storm-400">
          {detail}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
        <Link href={homeHref}>
          <Button variant="outline">{homeLabel}</Button>
        </Link>
      </div>
    </Card>
  );
}

/** Neutral placeholder for "nothing here yet" moments. */
export function EmptyState({
  title,
  message,
  icon,
  className,
}: {
  title: ReactNode;
  message?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-storm-800 bg-storm-900/40 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-3 text-storm-500">{icon}</div> : null}
      <p className="text-sm font-medium text-storm-200">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-storm-400">{message}</p> : null}
    </div>
  );
}
