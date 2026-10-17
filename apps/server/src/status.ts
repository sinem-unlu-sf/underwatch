import {
  EVENT_SOURCE_BASIS,
  EVENT_SOURCE_LABELS,
  type ComponentStatus,
  type DataMode,
  type EventSource,
  type IntegrationStatus,
  type SettingsStatusResponse,
} from "@kw/schema";
import { DEFAULT_RAW_EVIDENCE_RETENTION_DAYS, type DbLocation } from "./config";
import { stmt } from "./db/codec";
import type { Db } from "./db/connection";
import { appliedMigrations } from "./db/migrate";

const PENDING = "not implemented (pending architecture review)";

export interface StatusContext {
  db: Db;
  dbLocation: DbLocation;
  env: NodeJS.ProcessEnv;
}

function envIsSet(env: NodeJS.ProcessEnv, name: string): boolean {
  return Boolean(env[name]?.trim());
}

export function dataMode(db: Db): DataMode {
  const row = stmt(db, "SELECT COALESCE(SUM(is_fixture), 0) AS fixture_runs, COALESCE(SUM(1 - is_fixture), 0) AS live_runs FROM runs").get()!;
  const fixture_runs = Number(row.fixture_runs);
  return { fixture_runs, live_runs: Number(row.live_runs), contains_fixture_data: fixture_runs > 0 };
}

export function adapterStatus(): ComponentStatus {
  return {
    id: "claude-code",
    name: "Claude Code adapter",
    status: "not_implemented",
    detail: `claude-code: ${PENDING}. No Claude Code sessions can be supervised yet; only fixture runs are shown.`,
    configured_via: null,
  };
}

/** One entry per independent observer source in the schema. None exist yet, so none are active. */
export function collectorStatuses(): ComponentStatus[] {
  return (Object.keys(EVENT_SOURCE_BASIS) as EventSource[])
    .filter((s) => EVENT_SOURCE_BASIS[s] === "observed")
    .map((source) => ({
      id: source,
      name: EVENT_SOURCE_LABELS[source],
      status: "not_implemented" as const,
      detail: `Collector ${PENDING}. Not active: no events are being observed from this source.`,
      configured_via: null,
    }));
}

export function aiInferenceStatus(env: NodeJS.ProcessEnv): ComponentStatus {
  const keySet = envIsSet(env, "AIAND_API_KEY");
  return {
    id: "ai-and",
    name: "ai& Inference",
    status: keySet ? "not_implemented" : "not_configured",
    detail: keySet
      ? `AIAND_API_KEY is set (value not shown). The ai& provider is ${PENDING}; no requests are made.`
      : `Not configured: AIAND_API_KEY is not set. The ai& provider is also ${PENDING}.`,
    configured_via: keySet ? "AIAND_API_KEY" : null,
  };
}

export function neo4jStatus(env: NodeJS.ProcessEnv): ComponentStatus {
  const uriSet = envIsSet(env, "NEO4J_URI");
  return {
    id: "neo4j",
    name: "Neo4j evidence graph",
    status: uriSet ? "not_implemented" : "not_configured",
    detail: uriSet
      ? `NEO4J_URI is set (value not shown). Graph projection is ${PENDING}; no connection is attempted.`
      : `Not configured: NEO4J_URI is not set. Graph projection is also ${PENDING}.`,
    configured_via: uriSet ? "NEO4J_URI" : null,
  };
}

/** Worst-first ranking used to summarize several component statuses into one. */
const STATUS_SEVERITY: Record<IntegrationStatus, number> = {
  error: 6,
  degraded: 5,
  not_implemented: 4,
  not_configured: 3,
  disabled: 2,
  configured: 1,
  connected: 0,
};

export function worstStatus(statuses: IntegrationStatus[]): IntegrationStatus {
  return statuses.reduce<IntegrationStatus>((worst, s) => (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst] ? s : worst), "connected");
}

/** Components that make up "observation system health" on the overview. */
export function observationComponents(env: NodeJS.ProcessEnv): ComponentStatus[] {
  return [adapterStatus(), ...collectorStatuses(), neo4jStatus(env), aiInferenceStatus(env)];
}

export function settingsStatus({ db, dbLocation, env }: StatusContext): SettingsStatusResponse {
  const policyCounts = stmt(db, "SELECT COUNT(*) AS total, COALESCE(SUM(is_fixture), 0) AS fixture FROM policy_versions").get()!;
  const totalPolicies = Number(policyCounts.total);
  const fixturePolicies = Number(policyCounts.fixture);
  const activeLive = stmt(db, "SELECT id FROM policy_versions WHERE is_fixture = 0 ORDER BY julianday(created_at) DESC, id DESC LIMIT 1").get();
  const migrations = appliedMigrations(db);
  const latest = migrations.at(-1);

  return {
    generated_at: new Date().toISOString(),
    adapter: adapterStatus(),
    collectors: collectorStatuses(),
    policy: {
      id: "policy",
      name: "Policy",
      status: "not_implemented",
      detail:
        `${totalPolicies} policy version(s) stored (${fixturePolicies} from fixtures, ${totalPolicies - fixturePolicies} live). ` +
        (activeLive ? "" : "No live policy version exists, so no policy is active. ") +
        `Policy evaluation engine and policy editing are ${PENDING}.`,
      configured_via: null,
      active_policy_version_id: (activeLive?.id as string | undefined) ?? null,
    },
    ai_inference: aiInferenceStatus(env),
    neo4j: neo4jStatus(env),
    database: {
      id: "database",
      name: "Relational store (SQLite)",
      status: "connected",
      detail: `SQLite database ${dbLocation.path === ":memory:" ? "in memory" : "file is open"}; schema version ${latest ? `${latest.version} (${latest.name})` : "none"}.`,
      configured_via: dbLocation.configuredVia,
      driver: "node:sqlite",
    },
    retention: {
      status: "not_implemented",
      detail: `Proposed default: keep raw evidence ${DEFAULT_RAW_EVIDENCE_RETENTION_DAYS} days. Retention enforcement is ${PENDING}; nothing is deleted automatically.`,
      raw_evidence_retention_days: DEFAULT_RAW_EVIDENCE_RETENTION_DAYS,
    },
    redaction: {
      status: "not_implemented",
      detail: `Redaction pipeline ${PENDING}. Fixture evidence excerpts are hand-authored; no live evidence is captured yet.`,
    },
    data_mode: dataMode(db),
  };
}
