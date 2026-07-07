import clsx from "clsx";
import Link from "next/link";
import { IconWallet } from "@/components/dashboard/icons";
import { formatCredits } from "@/lib/format";

/**
 * Compact, clearly-labeled credits readout: icon + compact number + unit.
 * Neutral surface, never cyan-bordered or bold mono — the credits balance is
 * not the dashboard hero. Always exposes the unit to assistive tech even if a
 * caller later hides the visible label responsively.
 */
export function CreditPill({
  credits,
  href = "/wallet",
  size = "sm",
  label = "credits",
}: {
  credits: number;
  href?: string;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`${formatCredits(credits)} ${label}`}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border border-storm-800 bg-storm-850 font-medium text-storm-200",
        "transition-colors hover:border-storm-700 hover:bg-storm-800",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-storm-950",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
      )}
    >
      <IconWallet aria-hidden className={clsx(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4", "text-storm-400")} />
      <span className="text-storm-100">{formatCredits(credits)}</span>
      <span className="text-storm-400">{label}</span>
    </Link>
  );
}
