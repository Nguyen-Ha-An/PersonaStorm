"use client";

/**
 * Small hand-rolled UI kit (shadcn-style API, zero runtime deps beyond clsx).
 * Decision: shadcn/ui requires its CLI + Radix; for these primitives that's
 * more moving parts than the primitives themselves. Same look, less machinery.
 *
 * These primitives are the design system: every report card, badge, and input
 * inherits from here, so tuning them lifts the whole product at once.
 */

import clsx from "clsx";
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type InputHTMLAttributes,
} from "react";

// ── Layout ────────────────────────────────────────────────────────────────

/** Consistent page container: centered max-width with responsive padding. */
export function PageShell({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <main className={clsx("mx-auto w-full max-w-[75rem] px-5 sm:px-6", className)} {...props}>
      {children}
    </main>
  );
}

/** Eyebrow + title + optional description/action block that opens a section. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-storm-400">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-base font-semibold tracking-tight text-storm-100 sm:text-lg">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-storm-300">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Thin divider with an eyebrow label — separates dashboard zones. */
export function SectionRule({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-storm-400">
        {children}
      </span>
      <span className="h-px flex-1 bg-storm-800" />
    </div>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium",
        "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-accent-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-storm-950",
        "disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-5 py-3 text-[15px]",
        variant === "primary" && "bg-accent-primary text-storm-950 shadow-accent hover:bg-accent-primary/90",
        variant === "outline" &&
          "border border-storm-600 text-storm-200 hover:border-storm-500 hover:bg-storm-850",
        variant === "ghost" && "text-storm-300 hover:bg-storm-850 hover:text-storm-100",
        className,
      )}
      {...props}
    />
  );
}

// ── Card ──────────────────────────────────────────────────────────────────

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("rounded-2xl border border-storm-800 bg-storm-850 shadow-card", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-storm-800 px-5 py-4">
      <h3 className="text-sm font-semibold text-storm-100">{title}</h3>
      {action ? action : hint ? <span className="text-xs text-storm-400">{hint}</span> : null}
    </div>
  );
}

// ── Form primitives ──────────────────────────────────────────────────────────

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={clsx("mb-1.5 block text-xs font-medium text-storm-300", className)} {...props} />;
}

const FIELD =
  "w-full rounded-lg border border-storm-700 bg-storm-850 px-3.5 py-2.5 text-sm text-storm-100 " +
  "transition-colors placeholder:text-storm-500 hover:border-storm-600 " +
  "focus:border-accent-primary/70 focus:outline-none focus:ring-2 focus:ring-accent-primary/20";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(FIELD, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(FIELD, "leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={clsx(
          FIELD,
          "cursor-pointer appearance-none pr-9",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-storm-400"
      >
        <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Badges & indicators ──────────────────────────────────────────────────────

const LEVEL_STYLES: Record<string, string> = {
  low: "bg-signal-green/15 text-signal-green border-signal-green/40",
  medium: "bg-signal-yellow/15 text-signal-yellow border-signal-yellow/40",
  high: "bg-signal-red/15 text-signal-red border-signal-red/40",
  weak: "bg-signal-red/15 text-signal-red border-signal-red/40",
  moderate: "bg-signal-yellow/15 text-signal-yellow border-signal-yellow/40",
  strong: "bg-signal-green/15 text-signal-green border-signal-green/40",
  green: "bg-signal-green/15 text-signal-green border-signal-green/40",
  yellow: "bg-signal-yellow/15 text-signal-yellow border-signal-yellow/40",
  red: "bg-signal-red/15 text-signal-red border-signal-red/40",
};

/** Colored level chip. `invert` flips semantics for "high is bad" metrics. */
export function LevelBadge({
  level,
  invert = false,
  className,
}: {
  level: string;
  invert?: boolean;
  className?: string;
}) {
  let styleKey = level;
  if (invert) {
    styleKey = level === "high" ? "low" : level === "low" ? "high" : level;
  }
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        LEVEL_STYLES[styleKey] ?? "border-storm-600 text-storm-300",
        className,
      )}
    >
      {level}
    </span>
  );
}

type BadgeTone = "cyan" | "green" | "yellow" | "red" | "neutral";

const BADGE_TONES: Record<BadgeTone, { chip: string; dot: string }> = {
  cyan: { chip: "border-accent-primary/40 bg-accent-primary/10 text-accent-primary", dot: "bg-accent-primary" },
  green: { chip: "border-signal-green/40 bg-signal-green/10 text-signal-green", dot: "bg-signal-green" },
  yellow: { chip: "border-signal-yellow/40 bg-signal-yellow/10 text-signal-yellow", dot: "bg-signal-yellow" },
  red: { chip: "border-signal-red/40 bg-signal-red/10 text-signal-red", dot: "bg-signal-red" },
  neutral: { chip: "border-storm-700 bg-storm-850 text-storm-300", dot: "bg-storm-500" },
};

/** Pill with a status dot (optionally pulsing) — connection/run state, etc. */
export function StatusBadge({
  tone = "neutral",
  pulse = false,
  children,
  className,
}: {
  tone?: BadgeTone;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const t = BADGE_TONES[tone];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide",
        t.chip,
        className,
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", t.dot, pulse && "animate-pulseglow")} />
      {children}
    </span>
  );
}

export function StatusDot({ status }: { status: "green" | "yellow" | "red" | "pending" }) {
  return (
    <span
      className={clsx(
        "inline-block h-2 w-2 rounded-full",
        status === "green" && "bg-signal-green glow-green",
        status === "yellow" && "bg-signal-yellow glow-yellow",
        status === "red" && "bg-signal-red glow-red",
        status === "pending" && "bg-storm-700",
      )}
    />
  );
}

// ── Metric tile & skeleton ───────────────────────────────────────────────────

const METRIC_TONES: Record<string, string> = {
  green: "text-signal-green",
  yellow: "text-signal-yellow",
  red: "text-signal-red",
  cyan: "text-accent-primary",
  neutral: "text-storm-100",
};

/** Compact labeled metric readout used across the live view and reports. */
export function MetricCard({
  label,
  value,
  sub,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "green" | "yellow" | "red" | "cyan" | "neutral";
  className?: string;
}) {
  return (
    <div className={clsx("rounded-xl border border-storm-800 bg-storm-850 px-4 py-3.5", className)}>
      <p className="text-xs text-storm-400">{label}</p>
      <p className={clsx("mt-1.5 text-2xl font-semibold tracking-tight", METRIC_TONES[tone])}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-storm-400">{sub}</p> : null}
    </div>
  );
}

/** Shimmering placeholder block for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton rounded-lg", className)} />;
}

// ── Modal ─────────────────────────────────────────────────────────────────

/** Lightweight centered dialog. Closes on backdrop click or Escape. Focuses
 *  the panel on open. Renders nothing when `open` is false. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-storm-950/70" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-storm-700 bg-storm-900 shadow-card focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-storm-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-storm-100">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-storm-400 transition hover:bg-storm-850 hover:text-storm-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-storm-800 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
