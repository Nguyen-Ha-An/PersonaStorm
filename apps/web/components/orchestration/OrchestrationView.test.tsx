import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrchestrationView } from "./OrchestrationView";
import type { OrchestrationRecord } from "@/lib/types";

function record(overrides: Partial<OrchestrationRecord> = {}): OrchestrationRecord {
  return {
    status: "completed",
    physical_worker_count: 10,
    virtual_agent_count: 50,
    error_message: null,
    created_at: "2026-07-10T00:00:00.000Z",
    updated_at: "2026-07-10T00:00:00.000Z",
    plan: {
      objective: "Evaluate the pricing page",
      worker_count: 10,
      virtual_agent_count: 50,
      worker_shards: [],
      synthesis_instructions: "",
    },
    worker_shard_outputs: [
      {
        shard_id: "shard_0",
        role_name: "Budget skeptic",
        virtual_agent_results: [
          { virtual_agent_id: "va0", perspective: "", reaction_summary: "Too pricey", objections: [], purchase_or_adoption_drivers: [], confusion_points: [] },
        ],
        shard_summary: "Skeptical about price",
        confidence: "medium",
        failure_risks: [],
      },
    ],
    server_numerics: {
      physical_worker_count: 10,
      virtual_agent_count: 50,
      successful_workers: 10,
      failed_workers: 0,
      market_fit_score: 0.42,
      status: "yellow",
      green: 12,
      yellow: 28,
      red: 10,
      avg_confidence: 0.5,
    },
    final: {
      executive_summary: "The concept resonates with early adopters.",
      strongest_signals: ["Strong curiosity"],
      weakest_signals: ["Price anxiety"],
      segment_insights: [],
      objections_to_fix: ["Clarify pricing"],
      messaging_recommendations: ["Lead with ROI"],
      product_recommendations: [],
      pricing_or_offer_notes: [],
      final_recommendation: "Run a pricing A/B test",
      confidence: "medium",
    },
    ...overrides,
  };
}

describe("OrchestrationView", () => {
  it("renders physical/virtual counts, worker shards, and the final synthesis (reload path)", () => {
    render(<OrchestrationView record={record()} />);
    expect(screen.getByText("Physical workers")).toBeInTheDocument();
    expect(screen.getByText("10 max")).toBeInTheDocument();
    expect(screen.getByText("Virtual agents simulated")).toBeInTheDocument();
    // Worker shard card + final synthesis both render.
    expect(screen.getByText("Budget skeptic")).toBeInTheDocument();
    expect(screen.getByText("The concept resonates with early adopters.")).toBeInTheDocument();
    expect(screen.getByText("Run a pricing A/B test")).toBeInTheDocument();
  });

  it("does not imply 50 real API agents were deployed", () => {
    render(<OrchestrationView record={record()} />);
    // The framing copy explicitly disclaims 50 real API agents.
    expect(screen.getByText(/not 50 real API agents/i)).toBeInTheDocument();
  });

  it("shows an error state when the orchestration failed", () => {
    render(
      <OrchestrationView
        record={record({ status: "failed", error_message: "Too many workers failed.", final: null, worker_shard_outputs: [] })}
      />,
    );
    expect(screen.getByText("Orchestration failed")).toBeInTheDocument();
    expect(screen.getByText("Too many workers failed.")).toBeInTheDocument();
  });
});
