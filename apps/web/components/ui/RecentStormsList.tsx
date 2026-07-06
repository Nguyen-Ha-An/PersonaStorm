"use client";

import type { ReactNode } from "react";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { EmptyState } from "@/components/feedback";
import { StatusBadge } from "@/components/ui";
import { formatCredits, formatDate, formatNumberCompact } from "@/lib/format";
import type { StormHistoryItem } from "@/lib/types";

function statusTone(status: string): "green" | "yellow" | "red" | "cyan" | "neutral" {
  if (status === "complete") return "green";
  if (status === "failed") return "red";
  return "cyan";
}

/**
 * Wraps `DataTable` with the dashboard's recent-simulations columns. Kept as
 * a shared component to avoid duplicating this list between the dashboard
 * and the credits (wallet) page — callers own the `targetHref` routing
 * decision (`complete` → report, else the live view) via `onOpen`.
 */
export function RecentStormsList({
  storms,
  onOpen,
  emptyCta,
}: {
  storms: StormHistoryItem[];
  onOpen: (s: StormHistoryItem) => void;
  emptyCta?: ReactNode;
}) {
  const columns: Column<StormHistoryItem>[] = [
    {
      key: "title",
      header: "Simulation",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-storm-100">{s.title}</p>
          <p className="truncate font-mono text-[11px] text-storm-500">{s.id}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (s) => (
        <StatusBadge tone={statusTone(s.status)} pulse={s.status === "running"}>
          {s.status}
        </StatusBadge>
      ),
    },
    {
      key: "personas",
      header: "Personas",
      align: "right",
      cell: (s) => <span className="text-storm-300">{formatNumberCompact(s.persona_count)}</span>,
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      cell: (s) => <span className="text-storm-300">{formatCredits(s.price_credits)}</span>,
    },
    {
      key: "date",
      header: "Created",
      align: "right",
      cell: (s) => <span className="text-storm-400">{formatDate(s.created_at)}</span>,
    },
  ];

  if (storms.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No simulations yet"
          message="Run your first wind tunnel to see market reactions and a full validation report."
        />
        {emptyCta ? <div className="flex justify-center">{emptyCta}</div> : null}
      </div>
    );
  }

  return <DataTable columns={columns} rows={storms} rowKey={(s) => s.id} onRowClick={onOpen} />;
}
