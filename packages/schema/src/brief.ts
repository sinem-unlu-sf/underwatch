/**
 * Addendum C (judge feedback) section 3A: concise explanation of a finding ("brief").
 *
 * A brief is a deterministic PRESENTATION of the same stored records the full finding detail serves (finding, related
 * events, evidence, policy, coverage, safeguards, verification runs). It is built by the server without AI, is never
 * stored, and is not evidence: every statement is traceable to the record ids in `generated_from`. Action statuses are
 * computed from stored safeguard / verification rows only; there is deliberately no "done" status.
 */
import { z } from "zod";
import { EventId, EvidenceId, FindingId, PolicyVersionId, RunId, SafeguardId, VerificationRunId } from "./entities";
import { CoverageLevel, FindingCategory, SafeguardType } from "./enums";

export const FINDING_BRIEF_VERSION = "finding-brief/1";

/**
 * proposed:                     recommendation only; no safeguard record exists for this action.
 * safeguard_proposed:           a safeguard record exists but is not applied (proposed, approved, rejected, failed to apply, rolled back).
 * applied:                      the safeguard is recorded as applied; no completed verification establishes a result.
 * verified_for_tested_scenario: the latest verification run is served as passed (covers only the tested scenario).
 * failed_verification:          the latest verification run failed.
 * inconclusive:                 the latest verification run was inconclusive (or a stored pass is not established by its outcomes).
 */
export const BriefActionStatus = z.enum([
  "proposed",
  "safeguard_proposed",
  "applied",
  "verified_for_tested_scenario",
  "failed_verification",
  "inconclusive",
]);
export type BriefActionStatus = z.infer<typeof BriefActionStatus>;

export const BRIEF_ACTION_STATUS_LABELS: Record<BriefActionStatus, string> = {
  proposed: "Proposed (not created yet)",
  safeguard_proposed: "Safeguard proposed (not applied)",
  applied: "Applied (not verified)",
  verified_for_tested_scenario: "Verified for tested scenario",
  failed_verification: "Failed verification",
  inconclusive: "Verification inconclusive",
};

export const BriefAction = z.object({
  /** Stable within one brief ("fix-1".."fix-3"). */
  id: z.string().min(1),
  /** Specific next step, built from the finding category, resource and the MECHANISMS table. */
  text: z.string().min(1),
  /** Safeguard mechanism this action maps to; null for review / investigation steps. */
  mechanism: SafeguardType.nullable(),
  /** MECHANISMS[mechanism].can_enforce; null when there is no mechanism. A false value is guidance, never enforcement. */
  enforces: z.boolean().nullable(),
  /** What the mechanism cannot do (first MECHANISMS limitation), or null. */
  mechanism_limit: z.string().nullable(),
  status: BriefActionStatus,
  status_label: z.string(),
  /** Which stored record produced the status, in one sentence. */
  status_basis: z.string(),
  safeguard_id: SafeguardId.nullable(),
  verification_run_id: VerificationRunId.nullable(),
});
export type BriefAction = z.infer<typeof BriefAction>;

export const BriefUncertaintyKind = z.enum([
  "fixture_data",
  "confidence",
  "partial_coverage",
  "lossy_kernel_capture",
  "unknown_outcome",
  "unknown_task_outcome",
  "missing_information",
  "no_independent_observation",
]);
export type BriefUncertaintyKind = z.infer<typeof BriefUncertaintyKind>;

export const BriefUncertainty = z.object({ kind: BriefUncertaintyKind, text: z.string().min(1) });
export type BriefUncertainty = z.infer<typeof BriefUncertainty>;

export const BriefTerm = z.object({ term: z.string().min(1), meaning: z.string().min(1) });
export type BriefTerm = z.infer<typeof BriefTerm>;

export const FindingBrief = z.object({
  brief_version: z.string().min(1),
  /** Always true: no AI is involved in building a brief. */
  deterministic: z.literal(true),
  finding_id: FindingId,
  category: FindingCategory,
  /** True when the finding comes from a hand-labeled fixture (not a live capture). */
  is_fixture: z.boolean(),
  data_origin: z.string().min(1),
  /** 1-2 plain sentences: what happened / what potential issue was identified. */
  problem: z.string().min(1),
  /** 1-2 plain sentences: risk / consequence for this category. */
  why_it_matters: z.string().min(1),
  /** Short explanations of the technical terms used above. */
  terms: z.array(BriefTerm),
  /** 1-3 specific actions with statuses computed from stored records. */
  how_to_fix: z.array(BriefAction).min(1).max(3),
  affected: z.object({
    agent: z.string().min(1),
    task: z.string().nullable(),
    resource: z.string().nullable(),
    run_id: RunId,
    run_label: z.string().nullable(),
    policy_rule: z.object({ id: z.string(), effect: z.string().nullable(), description: z.string().nullable() }).nullable(),
  }),
  evidence_summary: z.object({
    agent_reported: z.number().int().nonnegative(),
    independently_observed: z.number().int().nonnegative(),
    /** Kernel Witness analysis records (correlation / policy evaluation). Not raw evidence. */
    derived: z.number().int().nonnegative(),
    evidence_records: z.number().int().nonnegative(),
    key_event_ids: z.array(EventId),
    key_evidence_ids: z.array(EvidenceId),
    coverage_level: CoverageLevel,
    coverage_caveats: z.array(z.string()),
    text: z.string().min(1),
  }),
  uncertainty: z.array(BriefUncertainty),
  /** Every record id the brief was built from. */
  generated_from: z.object({
    finding_id: FindingId,
    run_id: RunId,
    event_ids: z.array(EventId),
    evidence_ids: z.array(EvidenceId),
    policy_version_id: PolicyVersionId.nullable(),
    policy_rule_id: z.string().nullable(),
    coverage_report_run_id: RunId.nullable(),
    safeguard_ids: z.array(SafeguardId),
    verification_run_ids: z.array(VerificationRunId),
  }),
  disclaimer: z.string().min(1),
});
export type FindingBrief = z.infer<typeof FindingBrief>;

/** GET /api/findings/:id/brief */
export const FindingBriefResponse = z.object({ brief: FindingBrief });
export type FindingBriefResponse = z.infer<typeof FindingBriefResponse>;
