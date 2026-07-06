"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Brand, NavLinks, Sidebar } from "./Sidebar";
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
  const drawerRef = useRef<HTMLDivElement>(null);

  // Drawer a11y: close on Escape and move focus into the panel while open,
  // so keyboard users aren't left tabbing the page behind the overlay.
  useEffect(() => {
    if (!mobileNav) return;
    drawerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNav(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNav]);

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
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 w-64 border-r border-storm-800 bg-storm-950 p-3 pt-5 focus:outline-none"
          >
            <div className="mb-6 pt-1">
              <Brand />
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
              ? "mx-auto w-full max-w-[86rem] px-5 py-6 sm:px-6 lg:py-8"
              : "mx-auto w-full max-w-[75rem] px-5 py-6 sm:px-6 lg:py-8"
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
