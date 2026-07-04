"use client";

import clsx from "clsx";
import { Button } from "@/components/ui";
import { DataTable, type Column } from "./DataTable";
import { formatDate } from "@/lib/format";
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
          <p className="truncate font-medium text-storm-100">{u.full_name || u.email || "—"}</p>
          <p className="truncate text-xs text-storm-500">{u.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (u) => (
        <span
          className={clsx(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            u.role === "admin"
              ? "border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan"
              : "border-storm-700 bg-storm-850 text-storm-300",
          )}
        >
          {u.role}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      cell: (u) => <span className="font-mono text-storm-100">{u.balance_credits.toLocaleString()}</span>,
    },
    {
      key: "storms",
      header: "Storms",
      align: "right",
      cell: (u) => <span className="font-mono text-storm-300">{u.total_storms}</span>,
    },
    {
      key: "spent",
      header: "Spent",
      align: "right",
      cell: (u) => <span className="font-mono text-storm-300">{u.total_spent_credits.toLocaleString()}</span>,
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
