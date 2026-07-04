"use client";

import { useRouter } from "next/navigation";
import clsx from "clsx";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Button, Card, CardHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-storm-800 px-5 py-4 last:border-0">
      <span className="text-xs uppercase tracking-wider text-storm-400">{label}</span>
      <span className="text-sm font-medium text-storm-100">{value}</span>
    </div>
  );
}

export default function AccountPage() {
  const { me, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <DashboardShell title="Account" subtitle="Your profile and session">
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader title="Profile" />
          <div>
            <Field label="Email" value={me?.email ?? "—"} />
            <Field label="Full name" value={me?.full_name || "—"} />
            <Field
              label="Role"
              value={
                <span
                  className={clsx(
                    "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    me?.role === "admin"
                      ? "border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan"
                      : "border-storm-700 bg-storm-850 text-storm-300",
                  )}
                >
                  {me?.role ?? "user"}
                </span>
              }
            />
            <Field label="Member since" value={formatDate(me?.created_at)} />
            <Field
              label="Wallet balance"
              value={
                <span className="font-mono">
                  {(me?.wallet.balance_credits ?? 0).toLocaleString()} credits
                </span>
              }
            />
          </div>
        </Card>

        <Card className="flex items-center justify-between p-5">
          <div>
            <p className="text-sm font-medium text-storm-100">Sign out</p>
            <p className="text-xs text-storm-400">End your session on this device.</p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            Log out
          </Button>
        </Card>
      </div>
    </DashboardShell>
  );
}
