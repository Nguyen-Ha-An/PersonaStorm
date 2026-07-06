"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { IconChevron, IconLogout, IconUser } from "./icons";

function initials(email: string, name?: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { me, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!me) return null;

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-storm-800 bg-storm-900 py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-storm-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-storm-950"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-primary/15 text-[11px] font-semibold text-accent-primary">
          {initials(me.email, me.full_name)}
        </span>
        <span className="hidden max-w-[10rem] truncate text-xs font-medium text-storm-200 sm:block">
          {me.full_name || me.email}
        </span>
        <IconChevron className={clsx("h-3.5 w-3.5 text-storm-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-storm-800 bg-storm-900 shadow-card"
        >
          <div className="border-b border-storm-800 px-4 py-3">
            <p className="truncate text-sm font-medium text-storm-100">{me.full_name || "—"}</p>
            <p className="truncate text-xs text-storm-400">{me.email}</p>
            <span
              className={clsx(
                "mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                me.role === "admin"
                  ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
                  : "border-storm-700 bg-storm-850 text-storm-300",
              )}
            >
              {me.role}
            </span>
          </div>
          <div className="p-1.5">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-storm-300 transition-colors hover:bg-storm-850 hover:text-storm-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
            >
              <IconUser className="h-4 w-4 text-storm-500" /> Account
            </Link>
            <button
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-storm-300 transition-colors hover:bg-storm-850 hover:text-accent-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
            >
              <IconLogout className="h-4 w-4 text-storm-500" /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
