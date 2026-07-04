"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  IconDashboard,
  IconReport,
  IconShield,
  IconStorm,
  IconUser,
  IconWallet,
} from "./icons";

type NavItem = {
  href: string;
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
  match?: (path: string) => boolean;
  adminOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
  { href: "/storm/new", label: "New Storm", icon: IconStorm },
  {
    href: "/dashboard#history",
    label: "Reports",
    icon: IconReport,
    match: (p) => p.startsWith("/storm/") && p !== "/storm/new",
  },
  { href: "/wallet", label: "Wallet", icon: IconWallet },
  { href: "/account", label: "Account", icon: IconUser },
  { href: "/admin", label: "Admin", icon: IconShield, adminOnly: true },
];

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-pulseglow rounded-full bg-signal-cyan opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal-cyan" />
      </span>
      <span className="font-mono text-sm font-bold tracking-[0.22em] text-storm-100">
        PERSONA<span className="text-signal-cyan">STORM</span>
      </span>
    </Link>
  );
}

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const { isAdmin } = useAuth();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((n) => !n.adminOnly || isAdmin).map((item) => {
        const active = item.match
          ? item.match(pathname)
          : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={clsx(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-signal-cyan/10 text-storm-100"
                : "text-storm-400 hover:bg-storm-850 hover:text-storm-100",
            )}
          >
            <Icon
              className={clsx(
                "h-[18px] w-[18px] transition-colors",
                active ? "text-signal-cyan" : "text-storm-500 group-hover:text-storm-300",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Fixed left sidebar (lg and up). */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-storm-800/70 bg-storm-950/80 px-3 py-5 backdrop-blur lg:flex">
      <div className="mb-7 pt-1">
        <Brand />
      </div>
      <NavLinks />
      <div className="mt-auto px-2">
        <p className="rounded-lg border border-storm-800 bg-storm-900/60 px-3 py-2.5 text-[11px] leading-relaxed text-storm-500">
          The product wind tunnel. Synthetic signal, honestly labeled.
        </p>
      </div>
    </aside>
  );
}
