import { Card, CardHeader, MetricCard, StatusBadge } from "@/components/ui";
import type { OrchestrationRecord, OrchestrationStatus } from "@/lib/types";

/**
 * Renders the Nemotron-orchestrated Fireworks worker swarm for a run: planning
 * status, physical worker count (capped at 10), virtual agents simulated,
 * per-shard cards, the final Nemotron synthesis, and any error state.
 *
 * IMPORTANT framing: the copy makes clear that a large virtual-agent count does
 * NOT imply that many real API agents were deployed — only up to 10 physical
 * Fireworks workers run, each simulating several virtual agents.
 */

const STATUS_LABEL: Record<OrchestrationStatus, string> = {
  queued: "Queued",
  planning: "Planning",
  running_workers: "Running workers",
  synthesizing: "Synthesizing",
  completed: "Completed",
  failed: "Failed",
};

function statusTone(status: OrchestrationStatus): "green" | "red" | "cyan" | "yellow" {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  if (status === "queued") return "yellow";
  return "cyan";
}

export function OrchestrationView({ record }: { record: OrchestrationRecord }) {
  const { plan, worker_shard_outputs, final, server_numerics, status } = record;
  const physical = record.physical_worker_count || plan?.worker_count || 0;
  const virtual = record.virtual_agent_count || plan?.virtual_agent_count || 0;

  return (
    <section className="space-y-6" aria-label="Nemotron orchestration">
      <Card>
        <CardHeader
          title="Nemotron orchestration"
          action={<StatusBadge tone={statusTone(status)}>{STATUS_LABEL[status]}</StatusBadge>}
        />
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Physical workers" tone="cyan" value={`${physical}`} sub="10 max" />
            <MetricCard label="Virtual agents simulated" tone="neutral" value={`${virtual}`} />
            <MetricCard label="Main brain" tone="neutral" value="Nemotron" />
            <MetricCard label="Worker model" tone="neutral" value="DeepSeek-V4-Flash" sub="via Fireworks" />
          </div>
          <p className="text-xs text-storm-400">
            {virtual} virtual agents were simulated across at most 10 physical workers — not{" "}
            {virtual} real API agents. Each physical worker is one Fireworks call that reasons over
            several virtual personas internally.
          </p>
          {plan?.objective ? (
            <p className="text-sm text-storm-200">
              <span className="text-storm-400">Objective: </span>
              {plan.objective}
            </p>
          ) : null}
        </div>
      </Card>

      {status === "failed" ? (
        <Card className="border-signal-red/30 bg-signal-red/[0.06]">
          <div className="p-5 text-sm text-storm-200">
            <p className="font-semibold text-signal-red">Orchestration failed</p>
            <p className="mt-1 text-storm-300">
              {record.error_message ?? "The worker swarm could not complete this run."}
            </p>
          </div>
        </Card>
      ) : null}

      {worker_shard_outputs.length > 0 ? (
        <Card>
          <CardHeader title="Worker shards" hint={`${worker_shard_outputs.length} physical workers`} />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {worker_shard_outputs.map((shard) => (
              <div key={shard.shard_id} className="rounded-xl border border-storm-800 bg-storm-850 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-storm-100">{shard.role_name}</h4>
                  <StatusBadge tone={shard.confidence === "high" ? "green" : shard.confidence === "low" ? "red" : "yellow"}>
                    {shard.confidence}
                  </StatusBadge>
                </div>
                <p className="text-xs text-storm-400">
                  {shard.virtual_agent_results.length} virtual agents
                </p>
                {shard.shard_summary ? (
                  <p className="mt-2 text-sm text-storm-200">{shard.shard_summary}</p>
                ) : null}
                {shard.failure_risks.length > 0 ? (
                  <ul className="mt-2 list-disc pl-4 text-xs text-storm-400">
                    {shard.failure_risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {final ? (
        <Card>
          <CardHeader
            title="Nemotron synthesis"
            action={<StatusBadge tone={statusTone("completed")}>{final.confidence} confidence</StatusBadge>}
          />
          <div className="space-y-4 p-5">
            {server_numerics ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard label="Market fit (server)" tone="cyan" value={`${Math.round(server_numerics.market_fit_score * 100)}%`} />
                <MetricCard label="Status (server)" tone={server_numerics.status} value={server_numerics.status} />
                <MetricCard label="Adopts / unsure / rejects" tone="neutral" value={`${server_numerics.green} / ${server_numerics.yellow} / ${server_numerics.red}`} />
                <MetricCard label="Workers ok / failed" tone="neutral" value={`${server_numerics.successful_workers} / ${server_numerics.failed_workers}`} />
              </div>
            ) : null}
            {final.executive_summary ? (
              <p className="text-sm text-storm-200">{final.executive_summary}</p>
            ) : null}
            {final.final_recommendation ? (
              <div className="rounded-xl border border-accent-primary/30 bg-accent-primary/[0.06] p-4">
                <p className="text-xs text-storm-400">Final recommendation</p>
                <p className="mt-1 text-sm text-storm-100">{final.final_recommendation}</p>
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <StringList title="Strongest signals" items={final.strongest_signals} />
              <StringList title="Weakest signals" items={final.weakest_signals} />
              <StringList title="Objections to fix" items={final.objections_to_fix} />
              <StringList title="Messaging recommendations" items={final.messaging_recommendations} />
            </div>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

function StringList({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-storm-300">{title}</p>
      <ul className="list-disc space-y-1 pl-4 text-sm text-storm-200">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
