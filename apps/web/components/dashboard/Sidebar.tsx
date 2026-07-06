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
  { href: "/dashboard", label: "Overview", icon: IconDashboard },
  { href: "/storm/new", label: "New Simulation", icon: IconStorm },
  {
    href: "/dashboard#history",
    label: "Reports",
    icon: IconReport,
    match: (p) => p.startsWith("/storm/") && p !== "/storm/new",
  },
  { href: "/wallet", label: "Credits", icon: IconWallet },
  { href: "/account", label: "Account", icon: IconUser },
  { href: "/admin", label: "Admin", icon: IconShield, adminOnly: true },
];

/** Shared wordmark: a static accent mark + sentence-case "PersonaStorm". Used
 *  by the desktop rail and the mobile drawer so both stay in lockstep. */
export function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-primary" aria-hidden="true" />
      <span className="text-sm font-semibold tracking-tight text-storm-100">
        Persona<span className="text-accent-primary">Storm</span>
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
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-storm-950",
              active
                ? "bg-storm-850 text-storm-100"
                : "text-storm-400 hover:bg-storm-850 hover:text-storm-100",
            )}
          >
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent-primary"
              />
            ) : null}
            <Icon
              className={clsx(
                "h-[18px] w-[18px] transition-colors",
                active ? "text-accent-primary" : "text-storm-500 group-hover:text-storm-300",
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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-storm-800 bg-storm-950 px-3 py-5 lg:flex">
      <div className="mb-7 pt-1">
        <Brand />
      </div>
      <NavLinks />
      <div className="mt-auto px-2">
        <p className="rounded-lg border border-storm-800 bg-storm-900 px-3 py-2.5 text-xs leading-relaxed text-storm-400">
          The product wind tunnel. Synthetic signal, honestly labeled.
        </p>
      </div>
    </aside>
  );
}
