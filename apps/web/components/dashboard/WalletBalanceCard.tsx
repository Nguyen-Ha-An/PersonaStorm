"use client";

import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { IconWallet } from "./icons";

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
      <div className="flex items-start justify-between p-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-storm-400">
            <IconWallet className="h-4 w-4 text-signal-cyan" /> Wallet balance
          </div>
          <p className="mt-2 font-mono text-4xl font-bold leading-none text-storm-100">
            {balance.toLocaleString()}
            <span className="ml-2 text-sm font-medium text-storm-400">credits</span>
          </p>
          <p className="mt-2 text-xs text-storm-400">
            {lifetimeSpent.toLocaleString()} credits spent all-time
          </p>
        </div>
        {!compact && (
          <div className="flex flex-col gap-2">
            <Link href="/storm/new">
              <Button size="sm">New Storm</Button>
            </Link>
            <Link href="/wallet">
              <Button size="sm" variant="outline">
                History
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
