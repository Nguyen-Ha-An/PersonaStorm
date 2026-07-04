"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { IconWallet } from "./icons";
import { ApiStatusBadge } from "./ApiStatusBadge";
import { UserMenu } from "./UserMenu";

function WalletChip() {
  const { me } = useAuth();
  if (!me) return null;
  return (
    <Link
      href="/wallet"
      className="inline-flex items-center gap-2 rounded-lg border border-storm-800 bg-storm-900/70 px-2.5 py-1.5 transition hover:border-signal-cyan/40"
    >
      <IconWallet className="h-4 w-4 text-signal-cyan" />
      <span className="font-mono text-xs font-bold text-storm-100">
        {me.wallet.balance_credits.toLocaleString()}
      </span>
      <span className="hidden text-[10px] uppercase tracking-wider text-storm-500 sm:inline">
        credits
      </span>
    </Link>
  );
}

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
  return (
    <header className="sticky top-0 z-20 border-b border-storm-800/70 bg-storm-950/70 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button
          onClick={onMenu}
          aria-label="Open navigation"
          className="rounded-lg border border-storm-800 p-2 text-storm-300 transition hover:text-storm-100 lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight text-storm-100 sm:text-lg">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-xs text-storm-400">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {actions}
          <ApiStatusBadge />
          <WalletChip />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
