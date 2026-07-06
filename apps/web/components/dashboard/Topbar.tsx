"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { CreditPill } from "@/components/ui/CreditPill";
import { ApiStatusBadge } from "./ApiStatusBadge";
import { UserMenu } from "./UserMenu";

export function Topbar({
  title,
  subtitle,
  actions,
  onMenu,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onMenu?: () => void;
}) {
  const { me } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-storm-800 bg-storm-950/80 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button
          onClick={onMenu}
          aria-label="Open navigation"
          className="rounded-lg border border-storm-800 p-2 text-storm-300 transition-colors hover:text-storm-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-storm-950 lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight text-storm-100 sm:text-xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-xs text-storm-400">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {actions}
          <ApiStatusBadge />
          {me ? <CreditPill credits={me.wallet.balance_credits} /> : null}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
