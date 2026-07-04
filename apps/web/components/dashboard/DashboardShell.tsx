"use client";

import { useState, type ReactNode } from "react";
import { NavLinks, Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * The premium dashboard chrome: fixed sidebar (lg+), a sticky topbar with the
 * page title / wallet / user menu, and a centered content column. Pages pass
 * their own title, optional subtitle and header actions.
 */
export function DashboardShell({
  title,
  subtitle,
  actions,
  children,
  width = "default",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: "default" | "wide";
}) {
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className="min-h-screen bg-tunnel">
      <Sidebar />

      {/* mobile nav drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-storm-950/70 backdrop-blur-sm"
            onClick={() => setMobileNav(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-storm-800 bg-storm-950 p-3 pt-5">
            <div className="px-2 pb-6 font-mono text-sm font-bold tracking-[0.22em] text-storm-100">
              PERSONA<span className="text-signal-cyan">STORM</span>
            </div>
            <NavLinks onNavigate={() => setMobileNav(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <Topbar
          title={title}
          subtitle={subtitle}
          actions={actions}
          onMenu={() => setMobileNav(true)}
        />
        <main
          className={
            width === "wide"
              ? "mx-auto w-full max-w-[110rem] px-4 py-6 sm:px-6 lg:py-8"
              : "mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8"
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
