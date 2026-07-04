"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/feedback";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

/** Clean, readable table used across the dashboard and admin console. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  empty?: { title: string; message?: string };
  onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0) {
    return <EmptyState title={empty?.title ?? "Nothing here yet"} message={empty?.message} />;
  }

  const alignCls = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="overflow-x-auto rounded-xl border border-storm-800">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-storm-800 bg-storm-900/60">
            {columns.map((c) => (
              <th
                key={c.key}
                className={clsx(
                  "whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-storm-400",
                  alignCls(c.align),
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx(
                "border-b border-storm-800/60 last:border-0",
                onRowClick && "cursor-pointer transition-colors hover:bg-storm-850/50",
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={clsx("px-4 py-3 text-storm-200", alignCls(c.align), c.className)}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
