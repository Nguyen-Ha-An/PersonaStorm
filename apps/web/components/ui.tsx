/**
 * Small hand-rolled UI kit (shadcn-style API, zero runtime deps beyond clsx).
 * Decision: shadcn/ui requires its CLI + Radix; for four primitives that's
 * more moving parts than the primitives themselves. Same look, less machinery.
 */

import clsx from "clsx";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  InputHTMLAttributes,
} from "react";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold",
        "transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" &&
          "bg-signal-cyan/90 text-storm-950 hover:bg-signal-cyan shadow-[0_0_20px_rgba(34,211,238,0.25)]",
        variant === "outline" &&
          "border border-storm-600 text-storm-200 hover:border-signal-cyan/60 hover:text-white",
        variant === "ghost" && "text-storm-300 hover:text-white hover:bg-storm-800",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-storm-700/60 bg-storm-900/80 backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-storm-700/60 px-5 py-3.5">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-storm-300">
        {title}
      </h3>
      {hint ? <span className="text-xs text-storm-400">{hint}</span> : null}
    </div>
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={clsx(
        "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-storm-300",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-lg border border-storm-700 bg-storm-850 px-3 py-2.5 text-sm text-white",
        "placeholder:text-storm-400 focus:border-signal-cyan/70 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full rounded-lg border border-storm-700 bg-storm-850 px-3 py-2.5 text-sm leading-relaxed text-white",
        "placeholder:text-storm-400 focus:border-signal-cyan/70 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "w-full appearance-none rounded-lg border border-storm-700 bg-storm-850 px-3 py-2.5 text-sm text-white",
        "focus:border-signal-cyan/70 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

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
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
        LEVEL_STYLES[styleKey] ?? "border-storm-600 text-storm-300",
        className,
      )}
    >
      {level}
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
