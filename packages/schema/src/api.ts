import { z } from "zod";
import {
  CoverageReport,
  Event,
  EventCorrelation,
  Evidence,
  EventId,
  Finding,
  FindingId,
  FindingStatusChange,
  PolicyVersion,
  PolicyVersionId,
  Run,
  RunId,
  Safeguard,
  Timestamp,
  VerificationRun,
} from "./entities";
import {
  AgentType,
  EventBasis,
  EventType,
  FindingCategory,
  FindingStatus,
  IntegrationStatus,
  Outcome,
  RunStatus,
  SafeguardApplicationStatus,
  SafeguardApprovalStatus,
  SafeguardVerificationStatus,
  Severity,
} from "./enums";

// ---------------------------------------------------------------------------------------------------------------
// Routes. Server registers API_ROUTES (Fastify ":param" syntax); clients build URLs with apiPaths.
// ---------------------------------------------------------------------------------------------------------------

export const API_ROUTES = {
  health: "/api/health",
  overview: "/api/overview",
  runs: "/api/runs",
  run: "/api/runs/:id",
  runEvents: "/api/runs/:id/events",
  runFindings: "/api/runs/:id/findings",
  findings: "/api/findings",
  finding: "/api/findings/:id",
  findingStatus: "/api/findings/:id/status",
  safeguards: "/api/safeguards",
  evidence: "/api/evidence/:id",
  settingsStatus: "/api/settings/status",
} as const;
export type ApiRouteKey = keyof typeof API_ROUTES;

const enc = encodeURIComponent;
export const apiPaths = {
  health: () => API_ROUTES.health,
  overview: () => API_ROUTES.overview,
  runs: () => API_ROUTES.runs,
  run: (id: string) => `/api/runs/${enc(id)}`,
  runEvents: (id: string) => `/api/runs/${enc(id)}/events`,
  runFindings: (id: string) => `/api/runs/${enc(id)}/findings`,
  findings: () => API_ROUTES.findings,
  finding: (id: string) => `/api/findings/${enc(id)}`,
  findingStatus: (id: string) => `/api/findings/${enc(id)}/status`,
  safeguards: () => API_ROUTES.safeguards,
  evidence: (id: string) => `/api/evidence/${enc(id)}`,
  settingsStatus: () => API_ROUTES.settingsStatus,
} as const satisfies Record<ApiRouteKey, (...args: string[]) => string>;

// ---------------------------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------------------------

/** Every non-2xx response body. HTTP status: 400 validation_error, 404 not_found, 409 invalid_transition, 422 note_required, 500 internal_error, 501 not_implemented. */
export const ApiErrorCode = z.enum([
  "validation_error",
  "not_found",
  "invalid_transition",
  "note_required",
  "internal_error",
  "not_implemented",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiError = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

/** Query-string boolean: only the literal strings "true" / "false" are accepted. */
export const QueryBool = z.enum(["true", "false"]).transform((v) => v === "true");

/** include (default): fixture + live; exclude: live only; only: fixtures only. */
export const FixtureFilter = z.enum(["include", "exclude", "only"]);
export type FixtureFilter = z.infer<typeof FixtureFilter>;

export const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const IdParams = z.object({ id: z.string().min(1) });
export type IdParams = z.infer<typeof IdParams>;

const count = z.number().int().nonnegative();

export const EntityTotals = z.object({
  runs: count,
  events: count,
  findings: count,
  safeguards: count,
  verification_runs: count,
});
export type EntityTotals = z.infer<typeof EntityTotals>;

/** Lets every page say plainly whether it is showing fixture data, live data, or both. */
export const DataMode = z.object({
  fixture_runs: count,
  live_runs: count,
  contains_fixture_data: z.boolean(),
});
export type DataMode = z.infer<typeof DataMode>;

/** Status of one component. Never contains secrets: `configured_via` names the env var or file, never its value. */
export const ComponentStatus = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: IntegrationStatus,
  detail: z.string(),
  configured_via: z.string().nullable(),
});
export type ComponentStatus = z.infer<typeof ComponentStatus>;

// Run list rows ------------------------------------------------------------------------------------------------

export const RunListItem = Run.extend({
  event_count: count,
  finding_count: count,
  /** Findings in OPEN_FINDING_STATUSES. */
  open_finding_count: count,
  /** Highest severity among open findings; null when there are none. */
  max_open_severity: Severity.nullable(),
});
export type RunListItem = z.infer<typeof RunListItem>;

export const FindingListItem = Finding.extend({
  run_label: z.string().nullable(),
});
export type FindingListItem = z.infer<typeof FindingListItem>;

export const SafeguardListItem = Safeguard.extend({
  finding_title: z.string(),
  finding_status: FindingStatus,
  run_id: RunId,
  last_verification: VerificationRun.nullable(),
});
export type SafeguardListItem = z.infer<typeof SafeguardListItem>;

export const VerificationRunListItem = VerificationRun.extend({
  safeguard_title: z.string(),
});
export type VerificationRunListItem = z.infer<typeof VerificationRunListItem>;

// ---------------------------------------------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------------------------------------------

export const HealthResponse = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.literal("kernel-witness-api"),
  version: z.string(),
  time: Timestamp,
  database: z.object({
    ok: z.boolean(),
    driver: z.literal("node:sqlite"),
    detail: z.string(),
  }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

// ---------------------------------------------------------------------------------------------------------------
// GET /api/overview — every number is computed server-side from persisted rows. Item arrays are capped at
// OVERVIEW_ITEM_LIMIT; `count` is the full (uncapped) count.
// ---------------------------------------------------------------------------------------------------------------

export const OVERVIEW_ITEM_LIMIT = 5;

const countedList = <T extends z.ZodType>(item: T) => z.object({ count, items: z.array(item) });

export const OverviewResponse = z.object({
  generated_at: Timestamp,
  data_mode: DataMode,
  totals: EntityTotals,
  breakdown: z.object({ fixture: EntityTotals, live: EntityTotals }),
  /** Most recent by started_at desc. count = total runs. */
  recent_runs: countedList(RunListItem),
  /** Runs with open_finding_count > 0, ordered by max_open_severity desc then started_at desc. */
  runs_needing_review: countedList(RunListItem),
  /** status = "new", created_at desc. */
  new_findings: countedList(FindingListItem),
  /** status = "confirmed", updated_at desc. */
  confirmed_findings: countedList(FindingListItem),
  /** approval_status = "proposed", created_at desc. */
  safeguards_awaiting_approval: countedList(SafeguardListItem),
  /** status = "completed" verification runs, ended_at desc. */
  recent_verification_results: countedList(VerificationRunListItem),
  /** Same component statuses as /api/settings/status (adapter + collectors + neo4j + ai_inference). overall = worst-case summary. */
  observation_health: z.object({
    overall: IntegrationStatus,
    components: z.array(ComponentStatus),
  }),
});
export type OverviewResponse = z.infer<typeof OverviewResponse>;

// ---------------------------------------------------------------------------------------------------------------
// GET /api/runs
// ---------------------------------------------------------------------------------------------------------------

export const RunsQuery = Pagination.extend({
  /** Case-insensitive substring match over id, label, task_description. */
  q: z.string().trim().min(1).optional(),
  agent: AgentType.optional(),
  status: RunStatus.optional(),
  /** Inclusive bounds on started_at. */
  from: Timestamp.optional(),
  to: Timestamp.optional(),
  has_findings: QueryBool.optional(),
  fixture: FixtureFilter.default("include"),
});
export type RunsQuery = z.infer<typeof RunsQuery>;
export type RunsQueryInput = z.input<typeof RunsQuery>;

/** Ordered by started_at desc. total = count matching filters before pagination. */
export const RunsResponse = z.object({ items: z.array(RunListItem), total: count });
export type RunsResponse = z.infer<typeof RunsResponse>;

// ---------------------------------------------------------------------------------------------------------------
// GET /api/runs/:id
// ---------------------------------------------------------------------------------------------------------------

export const RunDetailResponse = z.object({
  run: Run,
  policy: PolicyVersion.nullable(),
  /** Null when no coverage report was recorded; UI must then show coverage as unknown. */
  coverage: CoverageReport.nullable(),
  counts: z.object({
    events: count,
    /** All three keys always present. */
    events_by_basis: z.record(EventBasis, count),
    evidence: count,
    findings: count,
    /** All six keys always present. */
    findings_by_status: z.record(FindingStatus, count),
    open_findings: count,
  }),
});
export type RunDetailResponse = z.infer<typeof RunDetailResponse>;

// ---------------------------------------------------------------------------------------------------------------
// GET /api/runs/:id/events
// ---------------------------------------------------------------------------------------------------------------

export const RunEventsQuery = z.object({
  event_type: EventType.optional(),
  outcome: Outcome.optional(),
  process_id: z.coerce.number().int().nonnegative().optional(),
  /** Restrict to events in that finding's related_event_ids. */
  finding_id: FindingId.optional(),
  basis: EventBasis.optional(),
});
export type RunEventsQuery = z.infer<typeof RunEventsQuery>;
export type RunEventsQueryInput = z.input<typeof RunEventsQuery>;

/**
 * items ordered by timestamp asc, then source_sequence asc (nulls last), then id. Not paginated.
 * correlations: all correlations for the run (unfiltered) for the reported-vs-observed comparison view.
 */
export const RunEventsResponse = z.object({
  items: z.array(Event),
  total: count,
  correlations: z.array(EventCorrelation),
});
export type RunEventsResponse = z.infer<typeof RunEventsResponse>;

// ---------------------------------------------------------------------------------------------------------------
// GET /api/runs/:id/findings  and  GET /api/findings
// ---------------------------------------------------------------------------------------------------------------

/** Ordered by severity desc, then created_at desc. */
export const RunFindingsResponse = z.object({ items: z.array(FindingListItem), total: count });
export type RunFindingsResponse = z.infer<typeof RunFindingsResponse>;

export const FindingsQuery = Pagination.extend({
  status: FindingStatus.optional(),
  category: FindingCategory.optional(),
  severity: Severity.optional(),
  run_id: RunId.optional(),
  fixture: FixtureFilter.default("include"),
});
export type FindingsQuery = z.infer<typeof FindingsQuery>;
export type FindingsQueryInput = z.input<typeof FindingsQuery>;

/** Ordered by created_at desc. */
export const FindingsResponse = z.object({ items: z.array(FindingListItem), total: count });
export type FindingsResponse = z.infer<typeof FindingsResponse>;

// ---------------------------------------------------------------------------------------------------------------
// GET /api/findings/:id
// ---------------------------------------------------------------------------------------------------------------

export const FindingDetailResponse = z.object({
  finding: Finding,
  run: Run,
  /** Events in related_event_ids, ordered like RunEventsResponse. UI splits them by basis (reported vs observed). */
  related_events: z.array(Event),
  /** Union of finding.evidence_ids and evidence referenced by related events, deduplicated. */
  evidence: z.array(Evidence),
  /** PolicyVersion referenced by finding.policy_id, else the run's policy_version, else null. */
  policy: PolicyVersion.nullable(),
  /** Ordered by `at` asc. */
  status_history: z.array(FindingStatusChange),
  safeguards: z.array(Safeguard),
  /** FINDING_STATUS_TRANSITIONS[finding.status]. */
  allowed_transitions: z.array(FindingStatus),
  /** ai& explanations are pending architecture review; until then status is "not_implemented" and no text is returned. */
  ai_explanation: z.object({ status: IntegrationStatus, detail: z.string() }),
});
export type FindingDetailResponse = z.infer<typeof FindingDetailResponse>;

// ---------------------------------------------------------------------------------------------------------------
// POST /api/findings/:id/status
// ---------------------------------------------------------------------------------------------------------------

/** Server validates with checkFindingTransition(); actor_type is always "user" for this endpoint. */
export const FindingStatusUpdateBody = z.object({
  to: FindingStatus,
  note: z.string().trim().max(2000).nullable().optional(),
});
export type FindingStatusUpdateBody = z.infer<typeof FindingStatusUpdateBody>;

export const FindingStatusUpdateResponse = z.object({
  finding: Finding,
  status_change: FindingStatusChange,
  allowed_transitions: z.array(FindingStatus),
});
export type FindingStatusUpdateResponse = z.infer<typeof FindingStatusUpdateResponse>;

// ---------------------------------------------------------------------------------------------------------------
// GET /api/safeguards
// ---------------------------------------------------------------------------------------------------------------

export const SafeguardsQuery = z.object({
  approval_status: SafeguardApprovalStatus.optional(),
  application_status: SafeguardApplicationStatus.optional(),
  verification_status: SafeguardVerificationStatus.optional(),
  finding_id: FindingId.optional(),
  fixture: FixtureFilter.default("include"),
});
export type SafeguardsQuery = z.infer<typeof SafeguardsQuery>;
export type SafeguardsQueryInput = z.input<typeof SafeguardsQuery>;

/** Ordered by created_at desc. */
export const SafeguardsResponse = z.object({ items: z.array(SafeguardListItem), total: count });
export type SafeguardsResponse = z.infer<typeof SafeguardsResponse>;

// ---------------------------------------------------------------------------------------------------------------
// GET /api/evidence/:id
// ---------------------------------------------------------------------------------------------------------------

export const EvidenceResponse = z.object({
  evidence: Evidence,
  referenced_by_event_ids: z.array(EventId),
  referenced_by_finding_ids: z.array(FindingId),
});
export type EvidenceResponse = z.infer<typeof EvidenceResponse>;

// ---------------------------------------------------------------------------------------------------------------
// GET /api/settings/status — statuses only; never secrets or secret-bearing values.
// ---------------------------------------------------------------------------------------------------------------

export const SettingsStatusResponse = z.object({
  generated_at: Timestamp,
  /** Claude Code adapter. "not_implemented" until architecture review. */
  adapter: ComponentStatus,
  /** One entry per independent observer (process/kernel tracer, file watcher, network proxy, git observer). */
  collectors: z.array(ComponentStatus),
  policy: ComponentStatus.extend({ active_policy_version_id: PolicyVersionId.nullable() }),
  ai_inference: ComponentStatus,
  neo4j: ComponentStatus,
  database: ComponentStatus.extend({ driver: z.literal("node:sqlite") }),
  retention: z.object({
    status: IntegrationStatus,
    detail: z.string(),
    raw_evidence_retention_days: z.number().int().positive().nullable(),
  }),
  redaction: z.object({ status: IntegrationStatus, detail: z.string() }),
  data_mode: DataMode,
});
export type SettingsStatusResponse = z.infer<typeof SettingsStatusResponse>;

// ---------------------------------------------------------------------------------------------------------------
// Machine-readable contract: one entry per endpoint.
// ---------------------------------------------------------------------------------------------------------------

interface EndpointContract {
  method: "GET" | "POST";
  path: string;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
}

export const API_CONTRACT = {
  health: { method: "GET", path: API_ROUTES.health, response: HealthResponse },
  overview: { method: "GET", path: API_ROUTES.overview, response: OverviewResponse },
  runs: { method: "GET", path: API_ROUTES.runs, query: RunsQuery, response: RunsResponse },
  run: { method: "GET", path: API_ROUTES.run, params: IdParams, response: RunDetailResponse },
  runEvents: { method: "GET", path: API_ROUTES.runEvents, params: IdParams, query: RunEventsQuery, response: RunEventsResponse },
  runFindings: { method: "GET", path: API_ROUTES.runFindings, params: IdParams, response: RunFindingsResponse },
  findings: { method: "GET", path: API_ROUTES.findings, query: FindingsQuery, response: FindingsResponse },
  finding: { method: "GET", path: API_ROUTES.finding, params: IdParams, response: FindingDetailResponse },
  findingStatus: {
    method: "POST",
    path: API_ROUTES.findingStatus,
    params: IdParams,
    body: FindingStatusUpdateBody,
    response: FindingStatusUpdateResponse,
  },
  safeguards: { method: "GET", path: API_ROUTES.safeguards, query: SafeguardsQuery, response: SafeguardsResponse },
  evidence: { method: "GET", path: API_ROUTES.evidence, params: IdParams, response: EvidenceResponse },
  settingsStatus: { method: "GET", path: API_ROUTES.settingsStatus, response: SettingsStatusResponse },
} as const satisfies Record<ApiRouteKey, EndpointContract>;
