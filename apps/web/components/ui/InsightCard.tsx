import clsx from "clsx";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";

type InsightTone = "insight" | "success" | "risk" | "danger" | "neutral";

const TONE_STYLES: Record<InsightTone, { rail: string; title: string; iconWrap: string }> = {
  insight: {
    rail: "border-l-accent-insight",
    title: "text-accent-insight",
    iconWrap: "bg-accent-insight/10 text-accent-insight",
  },
  success: {
    rail: "border-l-accent-success",
    title: "text-accent-success",
    iconWrap: "bg-accent-success/10 text-accent-success",
  },
  risk: {
    rail: "border-l-accent-risk",
    title: "text-accent-risk",
    iconWrap: "bg-accent-risk/10 text-accent-risk",
  },
  danger: {
    rail: "border-l-accent-danger",
    title: "text-accent-danger",
    iconWrap: "bg-accent-danger/10 text-accent-danger",
  },
  neutral: {
    rail: "border-l-storm-700",
    title: "text-storm-100",
    iconWrap: "bg-storm-800 text-storm-300",
  },
};

/**
 * A `Card` with a left accent rail and a tinted title — the primary vehicle
 * for synthesized findings (top blocker/strength callouts, "what this means").
 * Tone `insight` (default, violet) marks AI-derived synthesis.
 */
export function InsightCard({
  title,
  tone = "insight",
  icon,
  children,
  action,
  className,
}: {
  title: ReactNode;
  tone?: InsightTone;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = TONE_STYLES[tone];
  return (
    <Card className={clsx("border-l-2 p-5", t.rail, className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span
              className={clsx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                t.iconWrap,
              )}
              aria-hidden
            >
              {icon}
            </span>
          ) : null}
          <h3 className={clsx("min-w-0 text-sm font-semibold", t.title)}>{title}</h3>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3 text-sm leading-relaxed text-storm-300">{children}</div>
    </Card>
  );
}
