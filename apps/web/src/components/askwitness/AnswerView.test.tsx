import { EVIDENCE_SUPPORT_LABELS, checkAskWitnessOutput, type BundleEvidenceRef, type EventBasis, type InvestigationTurn } from "@kw/schema";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TurnView } from "./AnswerView";

const T = "2026-10-17T02:00:00.000Z";
const bases = new Map<string, EventBasis | null>([
  ["evt_obs1", "observed"],
  ["evt_rep1", "reported"],
  ["fnd_a", "derived"],
]);
const index = new Map<string, BundleEvidenceRef>(
  [...bases].map(([id, basis]) => [
    id,
    { evidence_id: id, kind: id.startsWith("fnd_") ? "finding" : "event", basis, source: null, timestamp: T, summary: `summary of ${id}`, run_id: "run_x" },
  ]),
);

// The model puts EVERY fact in verified_facts; the app decides the labels.
const answer = checkAskWitnessOutput(
  {
    summary: "The read of .env was blocked.",
    verified_facts: [
      { text: "A kernel observer saw the open() denied.", evidence_ids: ["evt_obs1", "evt_rep1"] },
      { text: "The agent says it tried to read .env.", evidence_ids: ["evt_rep1"] },
      { text: "Kernel Witness flagged this as a policy violation.", evidence_ids: ["fnd_a"] },
      { text: "The credentials were exfiltrated to a remote host.", evidence_ids: ["evt_made_up"] },
    ],
    hypotheses: [{ text: "The agent may have retried through another tool.", evidence_ids: [] }],
    unknowns: [{ text: "Whether a subprocess read the file." }],
    evidence_references: ["evt_obs1", "evt_ghost"],
    recommended_next_steps: ["Inspect process events after the denial."],
    recommended_safeguards: [{ type: "permission_rule", description: "Deny Read(.env) in supervised runs." }],
    insufficient_evidence: false,
  },
  bases,
);

function turn(over: Partial<InvestigationTurn> = {}): InvestigationTurn {
  return {
    id: "itn_1",
    investigation_id: "inv_1",
    client_request_id: "req-12345678",
    question: "Did the agent actually access the file?",
    evidence_ids: [...bases.keys()],
    bundle_hash: null,
    model: "deepseek-ai/deepseek-v4-flash",
    prompt_version: "ask-witness@1",
    status: "answered",
    answer,
    error: null,
    created_at: T,
    ...over,
  };
}

describe("Ask Witness answer rendering", () => {
  it("groups facts by the app-assigned support, not by the model's section", () => {
    render(<TurnView turn={turn()} ev={{ index, onOpen: () => {} }} />);

    const observed = screen.getByRole("region", { name: "Backed by observed evidence" });
    expect(within(observed).getByText("A kernel observer saw the open() denied.")).toBeInTheDocument();
    expect(within(observed).queryByText("The agent says it tried to read .env.")).toBeNull();
    expect(within(observed).getAllByTitle(/Assigned by Kernel Witness/)[0]).toHaveTextContent(EVIDENCE_SUPPORT_LABELS.observed_evidence);

    const reported = screen.getByRole("region", { name: "Supported only by agent-reported evidence" });
    expect(within(reported).getByText("The agent says it tried to read .env.")).toBeInTheDocument();
    expect(within(reported).getByText(EVIDENCE_SUPPORT_LABELS.reported_evidence_only)).toBeInTheDocument();

    const derived = screen.getByRole("region", { name: "Supported only by Kernel Witness analysis" });
    expect(within(derived).getByText("Kernel Witness flagged this as a policy violation.")).toBeInTheDocument();

    // A "verified_fact" whose only citation is not in the bundle is shown as unsupported, never as fact.
    const unsupported = screen.getByRole("region", { name: /Unsupported claims/ });
    expect(within(unsupported).getByText("The credentials were exfiltrated to a remote host.")).toBeInTheDocument();
    expect(within(observed).queryByText(/exfiltrated/)).toBeNull();
    expect(within(unsupported).getByText(EVIDENCE_SUPPORT_LABELS.unsupported)).toBeInTheDocument();

    expect(screen.getByRole("region", { name: "Hypotheses" })).toHaveTextContent("retried through another tool");
    expect(screen.getByRole("region", { name: "Unknowns" })).toHaveTextContent("Whether a subprocess read the file.");
  });

  it("never uses the word 'verified' and labels the answer as AI-generated with model and prompt version", () => {
    const { container } = render(<TurnView turn={turn()} ev={{ index, onOpen: () => {} }} />);
    expect(container.textContent ?? "").not.toMatch(/verified/i);
    expect(screen.getByText(/AI-generated - interprets evidence, does not establish facts/)).toBeInTheDocument();
    expect(screen.getByText(/deepseek-ai\/deepseek-v4-flash/)).toBeInTheDocument();
    expect(screen.getByText(/ask-witness@1/)).toBeInTheDocument();
  });

  it("makes only in-bundle ids clickable and opens the evidence drawer callback", async () => {
    const onOpen = vi.fn();
    render(<TurnView turn={turn()} ev={{ index, onOpen }} />);
    expect(screen.queryByRole("button", { name: "evt_made_up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "evt_ghost" })).toBeNull();
    expect(screen.getAllByText("evt_made_up").length).toBeGreaterThan(0);
    await userEvent.setup().click(screen.getAllByRole("button", { name: "evt_obs1" })[0]!);
    expect(onOpen).toHaveBeenCalledWith("evt_obs1");
    expect(screen.getByText(/2 not in bundle/)).toBeInTheDocument();
  });

  it("shows a recorded ai& failure with a retry and no answer sections", async () => {
    const onRetry = vi.fn();
    render(
      <TurnView
        turn={turn({ status: "ai_unavailable", answer: null, error: { code: "timeout", message: "ai& did not answer within 60s." } })}
        ev={{ index, onOpen: () => {} }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("ai& request timed out");
    expect(screen.queryByRole("region", { name: "Backed by observed evidence" })).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledWith("Did the agent actually access the file?");
  });

  it("flags insufficient evidence explicitly", () => {
    const thin = checkAskWitnessOutput(
      {
        summary: "Cannot tell.",
        verified_facts: [],
        hypotheses: [],
        unknowns: [{ text: "No observer covered the window." }],
        evidence_references: [],
        recommended_next_steps: [],
        recommended_safeguards: [],
        insufficient_evidence: false,
      },
      bases,
    );
    render(<TurnView turn={turn({ answer: thin, status: "insufficient_evidence" })} ev={{ index, onOpen: () => {} }} />);
    expect(screen.getByText(/Insufficient evidence/)).toBeInTheDocument();
  });
});
