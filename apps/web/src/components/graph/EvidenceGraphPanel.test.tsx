import type { FindingGraphResponse, GraphNode } from "@kw/schema";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { GraphBody } from "./EvidenceGraphPanel";

const node = (id: string, label: GraphNode["label"], title: string, extra: GraphNode["props"] = {}): GraphNode => ({
  id,
  label,
  title,
  basis: label === "ObservedEvent" ? "observed" : label === "AgentAction" ? "reported" : "derived",
  is_fixture: true,
  props: { run_id: "run_x", ...extra },
});

const base: FindingGraphResponse = {
  finding_id: "fnd_a",
  source: "neo4j",
  detail: "Neo4j projection: 3 node(s)",
  nodes: [node("fnd_a", "Finding", "Forbidden .env read"), node("evt_obs", "ObservedEvent", "cat opened .env"), node("evt_tool", "AgentAction", "Bash requested: cat .env")],
  edges: [
    { id: "SUPPORTED_BY:1", from: "fnd_a", to: "evt_obs", type: "SUPPORTED_BY", basis: "derived" },
    { id: "OBSERVED_AS:1", from: "evt_tool", to: "evt_obs", type: "OBSERVED_AS", basis: "inferred" },
  ],
  truncated: false,
  insights: {
    ancestry: [
      {
        event_id: "evt_obs",
        event_summary: "cat (pid 74201) opened .env for reading",
        chain: [
          { process_id: "prc_1", pid: 74000, name: "claude", spawned_basis: null },
          { process_id: "prc_2", pid: 74200, name: "bash", spawned_basis: "observed" },
          { process_id: "prc_3", pid: 74201, name: "cat", spawned_basis: "observed" },
        ],
        origin_tool_call: { event_id: "evt_tool", summary: "Bash requested: cat .env", tool_name: "Bash", relation_basis: "derived", hops_to_event_process: 1 },
        unresolved_reason: null,
      },
    ],
    cross_run: [
      {
        resource_id: "res_1",
        resource_key: "/workspace/demo-repo/.env",
        finding_id: "fnd_b",
        finding_title: "Attempted read of .env blocked by policy",
        finding_status: "new",
        run_id: "run_y",
        event_ids: ["evt_y"],
        event_bases: ["reported"],
        policy_version_id: "pol_1",
        this_policy_version_id: "pol_1",
        linked_by_recurrence: false,
        is_fixture: true,
      },
    ],
  },
};

function renderBody(data: FindingGraphResponse, cited = new Set<string>()) {
  return render(
    <MemoryRouter>
      <GraphBody data={data} cited={cited} hidden={new Set()} setHidden={() => undefined} selected={null} setSelected={() => undefined} latestInvestigation={null} />
    </MemoryRouter>,
  );
}

describe("EvidenceGraphPanel body", () => {
  it("shows the multi-hop ancestry back to the tool call, cross-run matches, and the basis legend", () => {
    renderBody(base, new Set(["evt_obs"]));
    expect(screen.getByText("cat (pid 74201) opened .env for reading").closest("a")).toHaveAttribute("href", "/runs/run_x?event=evt_obs");
    expect(screen.getByText(/Started by agent tool call/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Attempted read of .env blocked by policy" })).toHaveAttribute("href", "/findings/fnd_b");
    expect(screen.getByText("inferred (heuristic, not established)")).toBeInTheDocument();
    expect(screen.getByText(/cited by latest Ask Witness answer \(1\)/)).toBeInTheDocument();
  });

  it("says when traversal is unavailable in the relational fallback", () => {
    renderBody({ ...base, source: "relational", detail: "Neo4j unavailable (graph_unavailable); built from the relational store.", insights: null });
    expect(screen.getByText(/Neo4j unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Process ancestry and cross-run traversal need Neo4j/)).toBeInTheDocument();
  });
});
