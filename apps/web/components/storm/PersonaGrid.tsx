"use client";

import { memo } from "react";
import clsx from "clsx";
import type { CellStatus, ReactionEvent } from "@/lib/types";

/**
 * The 1,000-cell swarm grid. Cells are plain divs (no per-cell components) so
 * a full re-render at the 120 ms flush cadence stays cheap. Hover shows the
 * persona's quote via native title tooltip — zero JS cost.
 */
function PersonaGridInner({
  cells,
  reactions,
}: {
  cells: CellStatus[];
  reactions: Map<number, ReactionEvent>;
}) {
  return (
    <div
      className="grid w-full gap-[3px]"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(11px, 1fr))" }}
      role="img"
      aria-label="Live persona swarm grid"
    >
      {cells.map((status, i) => {
        const r = reactions.get(i);
        return (
          <div
            key={i}
            title={r ? `${r.persona_id} · ${r.segment}\n“${r.quote}”` : `persona #${i + 1} — waiting`}
            className={clsx(
              "aspect-square rounded-[2px] transition-colors duration-300",
              status === "pending" && "bg-storm-800/70",
              status === "green" && "animate-cellpop bg-signal-green/85",
              status === "yellow" && "animate-cellpop bg-signal-yellow/80",
              status === "red" && "animate-cellpop bg-signal-red/80",
            )}
          />
        );
      })}
    </div>
  );
}

export const PersonaGrid = memo(PersonaGridInner);
