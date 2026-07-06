import type { ReactNode } from "react";

/**
 * In-content header block for hero/greeting rows — distinct from the sticky
 * Topbar's compact title. Used for page intros: dashboard greeting, "Credits",
 * "Account", "Admin", etc.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-storm-400">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-storm-100">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-storm-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
