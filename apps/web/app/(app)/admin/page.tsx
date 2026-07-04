"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AdminUserTable } from "@/components/dashboard/AdminUserTable";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Alert, EmptyState } from "@/components/feedback";
import {
  Button,
  Card,
  CardHeader,
  Input,
  Label,
  MetricCard,
  Modal,
  Skeleton,
  StatusBadge,
} from "@/components/ui";
import {
  ApiError,
  adminAdjustWallet,
  adminGetPricing,
  adminListStormRuns,
  adminListUsers,
  adminSetRole,
  adminUpdatePricing,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { AdminStormRun, AdminUser, Pricing } from "@/lib/types";

type Tab = "overview" | "users" | "storms" | "pricing";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "storms", label: "Storm Runs" },
  { key: "pricing", label: "Pricing" },
];

export default function AdminPage() {
  const { me, isAdmin, refreshMe } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [storms, setStorms] = useState<AdminStormRun[] | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // adjust-wallet modal
  const [adjustUser, setAdjustUser] = useState<AdminUser | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const loadUsers = useCallback(async (q?: string) => {
    try {
      setUsers(await adminListUsers(q || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users.");
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    adminListStormRuns()
      .then(setStorms)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load storm runs."));
    adminGetPricing()
      .then(setPricing)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load pricing."));
  }, [isAdmin, loadUsers]);

  // --- gate on role -------------------------------------------------------
  if (me === null) {
    return (
      <DashboardShell title="Admin">
        <Skeleton className="h-40 w-full" />
      </DashboardShell>
    );
  }
  if (!isAdmin) {
    return (
      <DashboardShell title="Admin">
        <EmptyState
          title="Admins only"
          message="You don't have access to the admin console. If you believe this is a mistake, ask an existing admin to grant you the admin role."
        />
        <div className="mt-4 text-center">
          <Link href="/dashboard">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </div>
      </DashboardShell>
    );
  }

  // --- actions ------------------------------------------------------------
  function openAdjust(u: AdminUser) {
    setAdjustUser(u);
    setAdjustAmount("");
    setAdjustReason("");
    setAdjustError(null);
  }

  async function submitAdjust() {
    if (!adjustUser) return;
    const amount = Number(adjustAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      setAdjustError("Enter a non-zero amount (positive to credit, negative to debit).");
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError("A reason is required.");
      return;
    }
    setBusyId(adjustUser.id);
    try {
      await adminAdjustWallet(adjustUser.id, amount, adjustReason.trim());
      setAdjustUser(null);
      await loadUsers(search);
      await refreshMe(); // if the admin adjusted their own wallet
    } catch (e) {
      setAdjustError(e instanceof Error ? e.message : "Adjustment failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleRole(u: AdminUser) {
    setBusyId(u.id);
    setError(null);
    try {
      await adminSetRole(u.id, u.role === "admin" ? "user" : "admin");
      await loadUsers(search);
      await refreshMe();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError(e instanceof Error ? e.message : "Role change failed.");
    } finally {
      setBusyId(null);
    }
  }

  // --- overview metrics ---------------------------------------------------
  const totalUsers = users?.length ?? 0;
  const totalAdmins = users?.filter((u) => u.role === "admin").length ?? 0;
  const creditsInCirculation = users?.reduce((s, u) => s + u.balance_credits, 0) ?? 0;
  const totalStorms = storms?.length ?? 0;

  const stormCols: Column<AdminStormRun>[] = [
    {
      key: "storm",
      header: "Storm",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-storm-100">{s.title}</p>
          <p className="truncate font-mono text-[11px] text-storm-500">{s.id}</p>
        </div>
      ),
    },
    { key: "owner", header: "Owner", cell: (s) => <span className="text-storm-300">{s.user_email || s.user_id.slice(0, 8)}</span> },
    {
      key: "status",
      header: "Status",
      cell: (s) => (
        <StatusBadge
          tone={s.status === "complete" ? "green" : s.status === "failed" ? "red" : "cyan"}
          pulse={s.status === "running"}
        >
          {s.status}
        </StatusBadge>
      ),
    },
    { key: "personas", header: "Personas", align: "right", cell: (s) => <span className="font-mono">{s.persona_count.toLocaleString()}</span> },
    { key: "cost", header: "Cost", align: "right", cell: (s) => <span className="font-mono text-storm-300">{s.price_credits}</span> },
    { key: "date", header: "Created", align: "right", cell: (s) => <span className="whitespace-nowrap text-storm-400">{formatDate(s.created_at)}</span> },
  ];

  return (
    <DashboardShell title="Admin console" subtitle="Manage users, wallets, runs and pricing" width="wide">
      {error && (
        <Alert tone="red" title="Admin action failed" className="mb-5">
          {error}
        </Alert>
      )}

      {/* tabs */}
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-storm-800 bg-storm-900/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-signal-cyan/15 text-storm-100" : "text-storm-400 hover:text-storm-100",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Total users" value={totalUsers} tone="cyan" />
          <MetricCard label="Admins" value={totalAdmins} />
          <MetricCard label="Credits in circulation" value={creditsInCirculation.toLocaleString()} />
          <MetricCard label="Storm runs" value={totalStorms} />
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadUsers(search);
            }}
            className="flex gap-2"
          >
            <Input
              placeholder="Search by email or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
          {users === null ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <AdminUserTable
              users={users}
              onAdjust={openAdjust}
              onToggleRole={toggleRole}
              busyId={busyId}
            />
          )}
        </div>
      )}

      {tab === "storms" && (
        <>
          {storms === null ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <DataTable columns={stormCols} rows={storms} rowKey={(s) => s.id} empty={{ title: "No storm runs yet" }} />
          )}
        </>
      )}

      {tab === "pricing" && <PricingEditor pricing={pricing} onSaved={setPricing} />}

      {/* adjust-wallet modal */}
      <Modal
        open={adjustUser !== null}
        onClose={() => setAdjustUser(null)}
        title={`Adjust wallet — ${adjustUser?.email ?? ""}`}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setAdjustUser(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submitAdjust} disabled={busyId === adjustUser?.id}>
              Apply
            </Button>
          </>
        }
      >
        <p className="mb-4 text-xs text-storm-400">
          Current balance:{" "}
          <span className="font-mono text-storm-200">
            {(adjustUser?.balance_credits ?? 0).toLocaleString()}
          </span>{" "}
          credits. Use a positive amount to grant, negative to debit.
        </p>
        <div className="space-y-3">
          <div>
            <Label htmlFor="amt">Amount (credits)</Label>
            <Input
              id="amt"
              type="number"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder="e.g. 500 or -50"
            />
          </div>
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="Manual top-up for demo"
            />
          </div>
          {adjustError && <p className="text-xs text-signal-red">{adjustError}</p>}
        </div>
      </Modal>
    </DashboardShell>
  );
}

function PricingEditor({ pricing, onSaved }: { pricing: Pricing | null; onSaved: (p: Pricing) => void }) {
  const [form, setForm] = useState<Pricing | null>(pricing);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setForm(pricing), [pricing]);

  if (!form) return <Skeleton className="h-56 w-full" />;

  const preview =
    form.base_run_credits + 10 * form.credits_per_100_personas + form.analyst_report_credits;

  async function save() {
    if (!form) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const saved = await adminUpdatePricing({
        name: form.name || "Default",
        base_run_credits: form.base_run_credits,
        credits_per_100_personas: form.credits_per_100_personas,
        analyst_report_credits: form.analyst_report_credits,
      });
      onSaved(saved);
      setMsg("Pricing updated. New quotes use it immediately.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof Pricing, v: number) => setForm({ ...form, [k]: v });

  return (
    <Card className="max-w-xl">
      <CardHeader title="Active pricing rule" />
      <div className="space-y-4 p-5">
        {(
          [
            ["base_run_credits", "Base run credits"],
            ["credits_per_100_personas", "Credits per 100 personas"],
            ["analyst_report_credits", "Analyst report credits"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              type="number"
              min={0}
              value={form[key] as number}
              onChange={(e) => set(key, Math.max(0, Number(e.target.value)))}
            />
          </div>
        ))}

        <div className="rounded-lg border border-storm-800 bg-storm-850/60 px-4 py-3 text-sm">
          <span className="text-storm-400">A 1,000-persona run with analyst report costs </span>
          <span className="font-mono font-bold text-signal-cyan">{preview}</span>
          <span className="text-storm-400"> credits.</span>
        </div>

        {msg && <p className="text-xs text-signal-green">{msg}</p>}
        {err && <p className="text-xs text-signal-red">{err}</p>}

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save pricing"}
        </Button>
      </div>
    </Card>
  );
}
