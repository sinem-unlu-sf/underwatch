/**
 * Ask Witness (addendum Feature A). Two shapes on purpose:
 * - AskWitnessModelOutput: what ai& is asked to return. Untrusted. Never shown directly.
 * - AskWitnessAnswer: what the app stores/returns AFTER deterministic validation. Every fact/hypothesis carries an
 *   app-assigned `support` computed from the evidence bundle that was actually sent, never from the model's choice of
 *   section. The UI must label claims with EVIDENCE_SUPPORT_LABELS and must never call a claim "verified" because the
 *   model placed it in verified_facts.
 * AI responses live in investigation_turns, separate from evidence/events, and are never projected as event records.
 */
import { z } from "zod";
import { EventBasis, SafeguardType, Severity } from "./enums";
import { FindingId, RunId, Timestamp } from "./entities";
import { idPattern } from "./ids";

export const InvestigationId = z.string().regex(idPattern("investigation"));
export const InvestigationTurnId = z.string().regex(idPattern("investigation_turn"));

/** Client-generated idempotency key (UUID recommended). Re-sending the same key returns the stored result, never a duplicate. */
export const ClientRequestId = z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
export type ClientRequestId = z.infer<typeof ClientRequestId>;

export const InvestigationStatus = z.enum(["active", "closed"]);
export type InvestigationStatus = z.infer<typeof InvestigationStatus>;

/**
 * What an investigation is about. finding: one finding (v1). run: one agent run. workspace: all of Kernel Witness's own
 * records (findings, runs, coverage, safeguards, verification results, digest). Follow-ups always stay in their scope;
 * retrieval is deterministic and reads Kernel Witness's database only (never repository files, the web, or model SQL).
 */
export const InvestigationScopeKind = z.enum(["finding", "run", "workspace"]);
export type InvestigationScopeKind = z.infer<typeof InvestigationScopeKind>;

export const Investigation = z.object({
  id: InvestigationId,
  /** Additive (default "finding" for v1 rows). */
  scope_kind: InvestigationScopeKind.default("finding"),
  /** Finding id (finding scope), run id (run scope), null (workspace scope). */
  scope_id: z.string().nullable().default(null),
  /** Null for run / workspace scope. */
  finding_id: FindingId.nullable(),
  /** Null for workspace scope. */
  run_id: RunId.nullable(),
  status: InvestigationStatus,
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Investigation = z.infer<typeof Investigation>;

// ---------------------------------------------------------------------------------------------------------------
// Model output (sent to ai& as the response schema; validated locally even in strict json_schema mode)
// ---------------------------------------------------------------------------------------------------------------

const text = (max: number) => z.string().trim().min(1).max(max);
const modelIds = z.array(z.string().min(1).max(200)).max(20);

export const ModelClaim = z.object({ text: text(1000), evidence_ids: modelIds });
export type ModelClaim = z.infer<typeof ModelClaim>;

export const AskWitnessModelOutput = z.object({
  summary: text(2000),
  verified_facts: z.array(ModelClaim).max(12),
  hypotheses: z.array(ModelClaim).max(8),
  unknowns: z.array(z.object({ text: text(600) })).max(10),
  evidence_references: modelIds,
  recommended_next_steps: z.array(text(400)).max(8),
  recommended_safeguards: z.array(z.object({ type: SafeguardType, description: text(800) })).max(4),
  /** Model's own flag; the app ALSO derives insufficiency (see AskWitnessAnswer.insufficient_evidence). */
  insufficient_evidence: z.boolean(),
});
export type AskWitnessModelOutput = z.infer<typeof AskWitnessModelOutput>;

/** JSON Schema for ai& response_format (conservative keyword subset, every key required; limits enforced by Zod above). */
export const ASK_WITNESS_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    verified_facts: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, evidence_ids: { type: "array", items: { type: "string" } } },
        required: ["text", "evidence_ids"],
        additionalProperties: false,
      },
    },
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, evidence_ids: { type: "array", items: { type: "string" } } },
        required: ["text", "evidence_ids"],
        additionalProperties: false,
      },
    },
    unknowns: {
      type: "array",
      items: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
    },
    evidence_references: { type: "array", items: { type: "string" } },
    recommended_next_steps: { type: "array", items: { type: "string" } },
    recommended_safeguards: {
      type: "array",
      items: {
        type: "object",
        properties: { type: { type: "string", enum: [...SafeguardType.options] }, description: { type: "string" } },
        required: ["type", "description"],
        additionalProperties: false,
      },
    },
    insufficient_evidence: { type: "boolean" },
  },
  required: [
    "summary",
    "verified_facts",
    "hypotheses",
    "unknowns",
    "evidence_references",
    "recommended_next_steps",
    "recommended_safeguards",
    "insufficient_evidence",
  ],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Validated answer (stored + returned)
// ---------------------------------------------------------------------------------------------------------------

/**
 * App-assigned evidence basis of a claim, from the VALID cited ids only:
 * observed_evidence:       cites >= 1 in-bundle item whose basis is "observed".
 * reported_evidence_only:  valid citations, at least one "reported", none "observed".
 * derived_only:            valid citations are only "derived" items (findings, correlations, policy rules) - KW's own analysis.
 * unsupported:             no valid citation at all (none given, or every cited id is absent from the bundle).
 */
export const EvidenceSupport = z.enum(["observed_evidence", "reported_evidence_only", "derived_only", "unsupported"]);
export type EvidenceSupport = z.infer<typeof EvidenceSupport>;

/** The ONLY labels the UI may use for claims. Note: none of them says "verified". */
export const EVIDENCE_SUPPORT_LABELS: Record<EvidenceSupport, string> = {
  observed_evidence: "Backed by observed evidence",
  reported_evidence_only: "Agent-reported evidence only",
  derived_only: "Kernel Witness analysis only",
  unsupported: "Unsupported (no valid citation)",
};

export const CheckedClaim = z.object({
  text: z.string(),
  /** Cited ids that exist in the bundle that was sent (clickable). */
  evidence_ids: z.array(z.string()),
  /** Cited ids NOT in the bundle (never rendered as links). */
  invalid_evidence_ids: z.array(z.string()),
  support: EvidenceSupport,
  /** Distinct bases of the valid cited items. */
  cited_bases: z.array(EventBasis),
});
export type CheckedClaim = z.infer<typeof CheckedClaim>;

export const AskWitnessAnswer = z.object({
  summary: z.string(),
  /** Claims the model put in verified_facts that have >= 1 valid citation, each labeled by `support`. */
  verified_facts: z.array(CheckedClaim),
  /** Hypotheses keep their place even when unsupported (they are hypotheses), labeled by `support`. */
  hypotheses: z.array(CheckedClaim),
  unknowns: z.array(z.object({ text: z.string() })),
  /** Model's evidence_references filtered to in-bundle ids. */
  evidence_references: z.array(z.string()),
  recommended_next_steps: z.array(z.string()),
  recommended_safeguards: z.array(z.object({ type: SafeguardType, description: z.string() })),
  /** Facts that ended up with support "unsupported", moved out of verified_facts. */
  unsupported_claims: z.array(CheckedClaim),
  evidence_check: z.object({
    /** Distinct ids cited anywhere in the model output. */
    cited: z.number().int().nonnegative(),
    valid: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    invalid_ids: z.array(z.string()),
  }),
  /** model flag OR no fact with support observed_evidence/reported_evidence_only. */
  insufficient_evidence: z.boolean(),
  /** Always true: advisory interpretation, not evidence, never a status change. */
  advisory: z.literal(true),
  /**
   * App-generated (NOT model) statements about gaps in the bundle that was sent: no observed events, coverage gaps,
   * omitted items, invalid citations. Optional for compatibility; the server always sets it.
   */
  evidence_limitations: z.array(z.string()).optional(),
});
export type AskWitnessAnswer = z.infer<typeof AskWitnessAnswer>;

export const InvestigationTurnStatus = z.enum(["answered", "insufficient_evidence", "ai_unavailable", "ai_error", "invalid_output"]);
export type InvestigationTurnStatus = z.infer<typeof InvestigationTurnStatus>;

/** Safe error codes for failed turns. Messages never include prompts, keys, or raw provider bodies. */
export const InvestigationTurnErrorCode = z.enum(["not_configured", "unavailable", "rate_limited", "timeout", "provider_error", "invalid_output"]);
export type InvestigationTurnErrorCode = z.infer<typeof InvestigationTurnErrorCode>;

export const InvestigationTurn = z.object({
  id: InvestigationTurnId,
  investigation_id: InvestigationId,
  client_request_id: ClientRequestId,
  question: z.string(),
  /** allowed_ids of the bundle sent (or that would have been sent) for this turn. */
  evidence_ids: z.array(z.string()),
  bundle_hash: z.string().nullable(),
  /** Requested model id ("none" when ai& is not configured). */
  model: z.string(),
  prompt_version: z.string(),
  status: InvestigationTurnStatus,
  answer: AskWitnessAnswer.nullable(),
  error: z.object({ code: InvestigationTurnErrorCode, message: z.string() }).nullable(),
  created_at: Timestamp,
});
export type InvestigationTurn = z.infer<typeof InvestigationTurn>;

/** Display index so every cited id in an answer can be opened (event inspector / evidence panel / finding). */
export const BundleEvidenceRef = z.object({
  evidence_id: z.string(),
  /** coverage / safeguard / related_finding: Ask Witness context items (additive; Kernel Witness records, basis "derived"). */
  kind: z.enum(["finding", "event", "evidence", "policy_rule", "coverage", "safeguard", "related_finding", "run", "overview", "verification", "digest"]),
  basis: EventBasis.nullable(),
  source: z.string().nullable(),
  timestamp: Timestamp.nullable(),
  /** Short, redacted one-liner (event summary / evidence source_reference / rule description). */
  summary: z.string(),
  /** Where the UI navigates: event -> run timeline (run_id + event id), evidence -> /api/evidence/:id, finding -> finding page. */
  run_id: RunId.nullable(),
});
export type BundleEvidenceRef = z.infer<typeof BundleEvidenceRef>;

/** Run-scope starters (questions about one agent run). */
export const ASK_WITNESS_RUN_SUGGESTED_QUESTIONS = [
  "What did the agent do in this run, and what was blocked?",
  "Where does the agent's report differ from what was observed?",
  "Which findings in this run are still open?",
  "What could the observers not see in this run?",
] as const;

/** Workspace-scope starters (questions across all of Kernel Witness's records). */
export const ASK_WITNESS_WORKSPACE_SUGGESTED_QUESTIONS = [
  "What was blocked across all runs and what is still uncertain?",
  "Which open findings are the most severe?",
  "What happened today?",
  "Which safeguards have been verified, and what did verification show?",
  "Where is observation coverage weakest?",
] as const;

export const ASK_WITNESS_SUGGESTED_QUESTIONS = [
  "Why was this finding flagged?",
  "Did the agent actually access the file, or was the attempt blocked?",
  "Which evidence supports this conclusion?",
  "What happened immediately before and after this event?",
  "Is there another plausible explanation?",
  "What information is still missing?",
  "Have similar findings occurred in other runs?",
  "What safeguard would reduce the chance of recurrence?",
] as const;

// ---------------------------------------------------------------------------------------------------------------
// API bodies / responses
// ---------------------------------------------------------------------------------------------------------------

/** POST /api/findings/:id/investigations. Omit investigation_id to start a new investigation; pass it for follow-ups. */
export const AskWitnessBody = z.object({
  investigation_id: InvestigationId.optional(),
  question: z.string().trim().min(1).max(2000),
  client_request_id: ClientRequestId,
});
export type AskWitnessBody = z.infer<typeof AskWitnessBody>;

/**
 * Always HTTP 200 once the question is accepted: AI failures are recorded as a turn with status ai_unavailable /
 * ai_error / invalid_output (evidence untouched). replayed = true when client_request_id was seen before.
 */
export const AskWitnessResponse = z.object({
  investigation: Investigation,
  turn: InvestigationTurn,
  evidence_index: z.array(BundleEvidenceRef),
  replayed: z.boolean(),
});
export type AskWitnessResponse = z.infer<typeof AskWitnessResponse>;

export const InvestigationSummary = Investigation.extend({
  turn_count: z.number().int().nonnegative(),
  last_question: z.string().nullable(),
});
export type InvestigationSummary = z.infer<typeof InvestigationSummary>;

export const FindingInvestigationsResponse = z.object({ items: z.array(InvestigationSummary) });

/** GET /api/runs/:id/investigations and GET /api/investigations?scope=workspace share this list shape. */
export const ScopedInvestigationsResponse = FindingInvestigationsResponse;
export type ScopedInvestigationsResponse = FindingInvestigationsResponse;
export const InvestigationsListQuery = z.object({ scope: z.literal("workspace").default("workspace") });
export type InvestigationsListQuery = z.infer<typeof InvestigationsListQuery>;
export type FindingInvestigationsResponse = z.infer<typeof FindingInvestigationsResponse>;

export const InvestigationDetailResponse = z.object({
  investigation: Investigation,
  /** The finding for finding-scope investigations; null for run / workspace scope. */
  finding: z.object({ id: FindingId, title: z.string(), severity: Severity, run_id: RunId, is_fixture: z.boolean() }).nullable(),
  /** Additive: what the investigation is about (label is a short display string). */
  scope: z.object({ kind: InvestigationScopeKind, id: z.string().nullable(), label: z.string() }).optional(),
  /** Ordered by created_at asc. */
  turns: z.array(InvestigationTurn),
  /** Union over all turns. */
  evidence_index: z.array(BundleEvidenceRef),
  /** ai& status at read time, for the panel's banner (never contains secrets). */
  ai: z.object({ available: z.boolean(), detail: z.string() }),
});
export type InvestigationDetailResponse = z.infer<typeof InvestigationDetailResponse>;

// ---------------------------------------------------------------------------------------------------------------
// Deterministic validation helper (shared so server and tests agree)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Converts validated model output into an AskWitnessAnswer. `bases` maps every in-bundle id to its basis
 * (null basis items such as policy rules count as "derived").
 */
export function checkAskWitnessOutput(out: AskWitnessModelOutput, bases: ReadonlyMap<string, EventBasis | null>): AskWitnessAnswer {
  const cited = new Set<string>();
  const invalid = new Set<string>();
  const check = (c: ModelClaim): CheckedClaim => {
    const valid: string[] = [];
    const bad: string[] = [];
    for (const id of new Set(c.evidence_ids)) {
      cited.add(id);
      if (bases.has(id)) valid.push(id);
      else {
        bad.push(id);
        invalid.add(id);
      }
    }
    const cb = [...new Set(valid.map((id) => bases.get(id) ?? "derived"))] as EventBasis[];
    const support: EvidenceSupport =
      valid.length === 0 ? "unsupported" : cb.includes("observed") ? "observed_evidence" : cb.includes("reported") ? "reported_evidence_only" : "derived_only";
    return { text: c.text, evidence_ids: valid, invalid_evidence_ids: bad, support, cited_bases: cb };
  };
  const facts = out.verified_facts.map(check);
  const hypotheses = out.hypotheses.map(check);
  for (const id of out.evidence_references) {
    cited.add(id);
    if (!bases.has(id)) invalid.add(id);
  }
  const supportedFacts = facts.filter((f) => f.support !== "unsupported");
  const insufficient = out.insufficient_evidence || !supportedFacts.some((f) => f.support === "observed_evidence" || f.support === "reported_evidence_only");
  return {
    summary: out.summary,
    verified_facts: supportedFacts,
    hypotheses,
    unknowns: out.unknowns.map((u) => ({ text: u.text })),
    evidence_references: [...new Set(out.evidence_references.filter((id) => bases.has(id)))],
    recommended_next_steps: [...out.recommended_next_steps],
    recommended_safeguards: out.recommended_safeguards.map((s) => ({ type: s.type, description: s.description })),
    unsupported_claims: facts.filter((f) => f.support === "unsupported"),
    evidence_check: { cited: cited.size, valid: cited.size - invalid.size, invalid: invalid.size, invalid_ids: [...invalid] },
    insufficient_evidence: insufficient,
    advisory: true,
  };
}
