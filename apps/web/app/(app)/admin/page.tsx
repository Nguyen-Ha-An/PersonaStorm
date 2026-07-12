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
  Select,
  Skeleton,
  StatusBadge,
} from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ApiError,
  adminAdjustWallet,
  adminGetInferenceSettings,
  adminGetPricing,
  adminListStormRuns,
  adminListUsers,
  adminSetRole,
  adminTestInference,
  adminUpdateInferenceSettings,
  adminUpdatePricing,
  type InferenceTestResult,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCredits, formatDate, formatNumberCompact } from "@/lib/format";
import type { AdminStormRun, AdminUser, InferenceSettings, Pricing } from "@/lib/types";

type Tab = "overview" | "users" | "storms" | "pricing" | "inference";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "storms", label: "Storm Runs" },
  { key: "pricing", label: "Pricing" },
  { key: "inference", label: "Inference" },
];

/** Distinguishes a failed GET (per resource) from a failed mutation, so the
 *  alert names the right thing instead of a generic "Admin action failed". */
type AdminErrorKind = "users" | "storms" | "pricing" | "inference" | "action";
const ERROR_TITLES: Record<AdminErrorKind, string> = {
  users: "Couldn't load users",
  storms: "Couldn't load storm runs",
  pricing: "Couldn't load pricing",
  inference: "Couldn't load inference settings",
  action: "Admin action failed",
};

export default function AdminPage() {
  const { me, isAdmin, refreshMe } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [storms, setStorms] = useState<AdminStormRun[] | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [inference, setInference] = useState<InferenceSettings | null>(null);
  const [error, setError] = useState<{ kind: AdminErrorKind; message: string } | null>(null);

  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // adjust-wallet modal
  const [adjustUser, setAdjustUser] = useState<AdminUser | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // role-change confirmation modal
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);

  const loadUsers = useCallback(async (q?: string) => {
    try {
      setUsers(await adminListUsers(q || undefined));
    } catch (e) {
      setError({ kind: "users", message: e instanceof Error ? e.message : "Failed to load users." });
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    adminListStormRuns()
      .then(setStorms)
      .catch((e) =>
        setError({
          kind: "storms",
          message: e instanceof Error ? e.message : "Failed to load storm runs.",
        }),
      );
    adminGetPricing()
      .then(setPricing)
      .catch((e) =>
        setError({
          kind: "pricing",
          message: e instanceof Error ? e.message : "Failed to load pricing.",
        }),
      );
    adminGetInferenceSettings()
      .then(setInference)
      .catch((e) =>
        setError({
          kind: "inference",
          message: e instanceof Error ? e.message : "Failed to load inference settings.",
        }),
      );
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
      if (e instanceof ApiError) setError({ kind: "action", message: e.message });
      else setError({ kind: "action", message: e instanceof Error ? e.message : "Role change failed." });
    } finally {
      setBusyId(null);
    }
  }

  // Opens the confirmation modal instead of mutating immediately — the one
  // interaction addition allowed by the redesign. `onToggleRole`'s contract
  // (called with the target user) is unchanged; `toggleRole` above still does
  // the actual mutation once the admin confirms.
  function requestRoleChange(u: AdminUser) {
    setRoleTarget(u);
  }

  async function confirmRoleChange() {
    if (!roleTarget) return;
    const target = roleTarget;
    setRoleTarget(null);
    await toggleRole(target);
  }

  // --- overview metrics ---------------------------------------------------
  const totalUsers = users?.length ?? 0;
  const totalAdmins = users?.filter((u) => u.role === "admin").length ?? 0;
  const creditsInCirculation = users?.reduce((s, u) => s + u.balance_credits, 0) ?? 0;
  const totalStorms = storms?.length ?? 0;
  const overviewLoading = users === null || storms === null;

  const stormCols: Column<AdminStormRun>[] = [
    {
      key: "storm",
      header: "Storm",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-storm-100">{s.title}</p>
          <p className="truncate font-mono text-xs text-storm-400">{s.id}</p>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (s) =>
        s.user_email ? (
          <span className="text-storm-300">{s.user_email}</span>
        ) : (
          <span className="font-mono text-xs text-storm-400" title={s.user_id}>
            no name · {s.user_id.slice(0, 8)}
          </span>
        ),
    },
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
      cell: (s) => <span className="whitespace-nowrap text-storm-400">{formatDate(s.created_at)}</span>,
    },
  ];

  return (
    <DashboardShell title="Admin" width="wide">
      <div className="space-y-6">
        <PageHeader title="Admin" subtitle="Manage users, wallets, storm runs, and pricing." />

        {error && (
          <Alert tone="red" title={ERROR_TITLES[error.kind]}>
            {error.message}
          </Alert>
        )}

        {/* tabs */}
        <div
          role="tablist"
          aria-label="Admin sections"
          className="flex flex-wrap gap-1 rounded-xl border border-storm-800 bg-storm-900/60 p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-storm-950",
                tab === t.key ? "bg-storm-850 text-storm-100" : "text-storm-400 hover:text-storm-100",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" &&
          (overviewLoading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Skeleton className="h-[4.75rem] w-full" />
              <Skeleton className="h-[4.75rem] w-full" />
              <Skeleton className="h-[4.75rem] w-full" />
              <Skeleton className="h-[4.75rem] w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard label="Total users" value={formatNumberCompact(totalUsers)} />
              <MetricCard label="Admins" value={formatNumberCompact(totalAdmins)} />
              <MetricCard label="Credits in circulation" value={formatNumberCompact(creditsInCirculation)} />
              <MetricCard label="Storm runs" value={formatNumberCompact(totalStorms)} />
            </div>
          ))}

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
                aria-label="Search users by email or name"
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
                onToggleRole={requestRoleChange}
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
              <DataTable
                columns={stormCols}
                rows={storms}
                rowKey={(s) => s.id}
                empty={{ title: "No storm runs yet" }}
              />
            )}
          </>
        )}

        {tab === "pricing" && <PricingEditor pricing={pricing} onSaved={setPricing} />}

        {tab === "inference" && <InferenceEditor inference={inference} onSaved={setInference} />}
      </div>

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
          <span className="font-medium text-storm-200">
            {formatCredits(adjustUser?.balance_credits ?? 0)}
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

      {/* role-change confirmation modal — the one allowed interaction addition */}
      <Modal
        open={roleTarget !== null}
        onClose={() => setRoleTarget(null)}
        title={`Change role for ${roleTarget?.email ?? ""}?`}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmRoleChange} disabled={busyId === roleTarget?.id}>
              {roleTarget?.role === "admin" ? "Remove admin" : "Make admin"}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-storm-300">
          {roleTarget?.role === "admin"
            ? "This removes admin access — they'll drop back to a standard user."
            : "This grants full admin access, including wallet adjustments and pricing changes."}
        </p>
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

        <p className="text-xs text-storm-400">
          A 1,000-persona run with the analyst report costs{" "}
          <span className="font-medium text-storm-200">{formatCredits(preview)}</span> credits at
          these rates.
        </p>

        {msg && <p className="text-xs text-signal-green">{msg}</p>}
        {err && <p className="text-xs text-signal-red">{err}</p>}

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save pricing"}
        </Button>
      </div>
    </Card>
  );
}

function InferenceEditor({
  inference,
  onSaved,
}: {
  inference: InferenceSettings | null;
  onSaved: (s: InferenceSettings) => void;
}) {
  const [form, setForm] = useState<InferenceSettings | null>(inference);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<InferenceTestResult | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  useEffect(() => setForm(inference), [inference]);

  if (!form) return <Skeleton className="h-56 w-full" />;

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    setTestErr(null);
    try {
      setTestResult(await adminTestInference());
    } catch (e) {
      setTestErr(e instanceof Error ? e.message : "Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const saved = await adminUpdateInferenceSettings({
        inference_provider: form.inference_provider,
        analyst_provider: form.analyst_provider,
        nvidia_model: form.nvidia_model,
        fireworks_model: form.fireworks_model,
        analyst_model: form.analyst_model,
        nvidia_max_tokens: form.nvidia_max_tokens,
        analyst_max_tokens: form.analyst_max_tokens,
      });
      onSaved(saved);
      setMsg("Inference settings updated. New storms use them immediately.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof InferenceSettings>(key: K, value: InferenceSettings[K]) {
    setForm({ ...form, [key]: value } as InferenceSettings);
  }

  return (
    <Card className="max-w-xl">
      <CardHeader title="Active inference settings" />
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="inference_provider">Inference provider</Label>
            <Select
              id="inference_provider"
              value={form.inference_provider}
              onChange={(e) =>
                set("inference_provider", e.target.value as InferenceSettings["inference_provider"])
              }
            >
              <option value="mock">mock</option>
              <option value="fireworks">fireworks</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="analyst_provider">Analyst provider</Label>
            <Select
              id="analyst_provider"
              value={form.analyst_provider}
              onChange={(e) =>
                set("analyst_provider", e.target.value as InferenceSettings["analyst_provider"])
              }
            >
              <option value="mock">mock</option>
              <option value="fireworks">fireworks</option>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="fireworks_model">Fireworks model</Label>
          <Input
            id="fireworks_model"
            value={form.fireworks_model}
            onChange={(e) => set("fireworks_model", e.target.value)}
            placeholder="accounts/fireworks/models/…"
          />
        </div>

        <div>
          <Label htmlFor="nvidia_model">NVIDIA model</Label>
          <Input
            id="nvidia_model"
            value={form.nvidia_model}
            onChange={(e) => set("nvidia_model", e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="analyst_model">Analyst model</Label>
          <Input
            id="analyst_model"
            value={form.analyst_model}
            onChange={(e) => set("analyst_model", e.target.value)}
            placeholder="Falls back to the NVIDIA model when empty"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="nvidia_max_tokens">NVIDIA max tokens</Label>
            <Input
              id="nvidia_max_tokens"
              type="number"
              min={1}
              value={form.nvidia_max_tokens}
              onChange={(e) => set("nvidia_max_tokens", Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div>
            <Label htmlFor="analyst_max_tokens">Analyst max tokens</Label>
            <Input
              id="analyst_max_tokens"
              type="number"
              min={1}
              value={form.analyst_max_tokens}
              onChange={(e) => set("analyst_max_tokens", Math.max(1, Number(e.target.value)))}
            />
          </div>
        </div>

        <div>
          <Label>Fireworks base URL</Label>
          <p className="truncate rounded-lg border border-storm-800 bg-storm-900/60 px-3 py-2 text-xs text-storm-400">
            {form.fireworks_base_url}
          </p>
        </div>

        <div>
          <Label>Fireworks API key</Label>
          <div>
            <StatusBadge tone={form.fireworks_api_key_configured ? "green" : "yellow"}>
              {form.fireworks_api_key_configured ? "API key: configured" : "API key: not set"}
            </StatusBadge>
          </div>
        </div>

        <div>
          <Label>NVIDIA base URL</Label>
          <p className="truncate rounded-lg border border-storm-800 bg-storm-900/60 px-3 py-2 text-xs text-storm-400">
            {form.nvidia_base_url}
          </p>
        </div>

        <div>
          <Label>NVIDIA API key</Label>
          <div>
            <StatusBadge tone={form.nvidia_api_key_configured ? "green" : "yellow"}>
              {form.nvidia_api_key_configured ? "API key: configured" : "API key: not set"}
            </StatusBadge>
          </div>
        </div>

        {form.orchestration && (
          <div className="rounded-lg border border-storm-800 bg-storm-900/40 p-4">
            <p className="mb-2 text-xs font-semibold text-storm-200">
              Orchestrated Fireworks worker swarm
            </p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={form.orchestration.orchestration_enabled ? "green" : "yellow"}>
                {form.orchestration.orchestration_enabled ? "orchestration: on" : "orchestration: off"}
              </StatusBadge>
              <StatusBadge tone="green">
                {`orchestrator: ${form.orchestration.orchestrator_provider}`}
              </StatusBadge>
              <StatusBadge tone={form.fireworks_api_key_configured ? "green" : "yellow"}>
                {form.fireworks_api_key_configured ? "Fireworks key: configured" : "Fireworks key: not set"}
              </StatusBadge>
            </div>
            <p className="mt-2 text-xs text-storm-400">
              Main brain: {form.orchestration.orchestrator_model} via{" "}
              {form.orchestration.orchestrator_provider}. Workers:{" "}
              {form.orchestration.worker_model || "DeepSeek-V4-Flash"} via Fireworks. Physical
              workers: {form.orchestration.max_physical_workers} (hard cap{" "}
              {form.orchestration.max_physical_workers_cap}); ~
              {form.orchestration.virtual_agents_per_worker} virtual agents each.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-storm-800 bg-storm-900/40 p-4">
          <p className="mb-2 text-xs font-semibold text-storm-200">Live connection test</p>
          <p className="mb-3 text-xs text-storm-400">
            Makes two tiny Fireworks calls with the exact per-storm config: a plain JSON call
            (key + model + endpoint) and a schema-constrained call (the swarm&apos;s request shape).
          </p>
          <Button onClick={runTest} disabled={testing}>
            {testing ? "Testing…" : "Test Fireworks connection"}
          </Button>
          {testErr && <p className="mt-2 text-xs text-signal-red">{testErr}</p>}
          {testResult && (
            <div className="mt-3 space-y-1 text-xs">
              <p className="text-storm-400">
                provider: {testResult.provider} · model: {testResult.model ?? "—"} · key:{" "}
                {testResult.api_key_configured ? "configured" : "NOT SET"}
              </p>
              <p className={testResult.basic.ok ? "text-signal-green" : "text-signal-red"}>
                basic call: {testResult.basic.ok ? "OK" : "FAILED"} — {testResult.basic.detail}
              </p>
              <p className={testResult.schema.ok ? "text-signal-green" : "text-signal-red"}>
                schema call: {testResult.schema.ok ? "OK" : "FAILED"} — {testResult.schema.detail}
              </p>
              <p className={testResult.swarm.ok ? "text-signal-green" : "text-signal-red"}>
                full reaction: {testResult.swarm.ok ? "OK" : "FAILED"} — {testResult.swarm.detail}
              </p>
            </div>
          )}
        </div>

        {msg && <p className="text-xs text-signal-green">{msg}</p>}
        {err && <p className="text-xs text-signal-red">{err}</p>}

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save inference settings"}
        </Button>
      </div>
    </Card>
  );
}
