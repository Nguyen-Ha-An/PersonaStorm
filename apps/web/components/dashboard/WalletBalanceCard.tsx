"use client";

import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { formatCredits } from "@/lib/format";
import { IconWallet } from "./icons";

/**
 * Calm "Available credits" panel — the balance is informational, never the
 * page hero. Props stay byte-compatible with the previous wallet-hero card.
 */
export function WalletBalanceCard({
  balance,
  lifetimeSpent,
  compact = false,
}: {
  balance: number;
  lifetimeSpent: number;
  compact?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-storm-400">
            <IconWallet aria-hidden className="h-4 w-4 text-storm-400" />
            Available credits
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-storm-100">
            {formatCredits(balance)}
          </p>
          <p className="mt-1.5 text-xs text-storm-400">
            {formatCredits(lifetimeSpent)} credits spent all-time
          </p>
        </div>
        {!compact && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link href="/storm/new">
              <Button size="sm">New Simulation</Button>
            </Link>
            <Link href="/dashboard#history">
              <Button size="sm" variant="outline">
                View Reports
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
