"use client";

import clsx from "clsx";
import { Button } from "@/components/ui";
import { DataTable, type Column } from "./DataTable";
import { formatCredits, formatDate, formatNumberCompact } from "@/lib/format";
import type { AdminUser } from "@/lib/types";

export function AdminUserTable({
  users,
  onAdjust,
  onToggleRole,
  busyId,
}: {
  users: AdminUser[];
  onAdjust: (u: AdminUser) => void;
  onToggleRole: (u: AdminUser) => void;
  busyId?: string | null;
}) {
  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      header: "User",
      cell: (u) => (
        <div className="min-w-0">
          <p
            className={clsx(
              "truncate",
              u.full_name ? "font-medium text-storm-100" : "font-mono text-sm text-storm-400",
            )}
          >
            {u.full_name || "no name"}
          </p>
          <p className="truncate text-xs text-storm-300">{u.email || "—"}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (u) => (
        <span
          className={clsx(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            u.role === "admin"
              ? "border-storm-600 bg-storm-800 text-storm-100"
              : "border-storm-700 bg-storm-850 text-storm-400",
          )}
        >
          {u.role === "admin" ? "Admin" : "User"}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      cell: (u) => <span className="font-medium text-storm-100">{formatCredits(u.balance_credits)}</span>,
    },
    {
      key: "storms",
      header: "Storms",
      align: "right",
      cell: (u) => <span className="text-storm-300">{formatNumberCompact(u.total_storms)}</span>,
    },
    {
      key: "spent",
      header: "Spent",
      align: "right",
      cell: (u) => <span className="text-storm-300">{formatCredits(u.total_spent_credits)}</span>,
    },
    {
      key: "joined",
      header: "Joined",
      align: "right",
      cell: (u) => <span className="whitespace-nowrap text-storm-400">{formatDate(u.created_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (u) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={busyId === u.id}
            onClick={() => onAdjust(u)}
          >
            Adjust
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busyId === u.id}
            onClick={() => onToggleRole(u)}
          >
            {u.role === "admin" ? "Demote" : "Make admin"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={users}
      rowKey={(u) => u.id}
      empty={{ title: "No users found", message: "Try a different search." }}
    />
  );
}
