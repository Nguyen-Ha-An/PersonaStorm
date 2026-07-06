import clsx from "clsx";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";

/**
 * A prominent CTA panel (e.g. dashboard "Run a new simulation"). Replaces the
 * old wallet-hero-as-CTA — the credits balance is never the hero here.
 */
export function ActionPanel({
  title,
  description,
  primary,
  secondary,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={clsx("p-6", className)}>
      <div className="flex items-start gap-4">
        {icon ? (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary"
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight text-storm-100 sm:text-lg">
            {title}
          </h3>
          {description ? (
            <p className="mt-1.5 text-sm leading-relaxed text-storm-300">{description}</p>
          ) : null}
          {primary || secondary ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {primary}
              {secondary}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
