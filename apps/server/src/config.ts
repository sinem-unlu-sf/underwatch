import { fileURLToPath } from "node:url";
import path from "node:path";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));
export const FIXTURE_RUNS_DIR = path.join(REPO_ROOT, "fixtures", "runs");
export const DEFAULT_DB_PATH = path.join(REPO_ROOT, "data", "kw.db");

export const SERVICE_VERSION = "0.1.0";
export const HOST = "127.0.0.1";
export const ALLOWED_ORIGINS = ["http://127.0.0.1:4601", "http://localhost:4601"];

/** Actor recorded for finding status changes made through the UI/API. */
export const UI_ACTOR = "developer";

/** Default proposal shown on the settings page; nothing enforces it yet. */
export const DEFAULT_RAW_EVIDENCE_RETENTION_DAYS = 30;

export interface DbLocation {
  path: string;
  configuredVia: string;
}

export function resolveDbLocation(env: NodeJS.ProcessEnv = process.env): DbLocation {
  const override = env.KW_DB_PATH?.trim();
  if (override) return { path: override === ":memory:" ? override : path.resolve(override), configuredVia: "KW_DB_PATH" };
  return { path: DEFAULT_DB_PATH, configuredVia: "default (data/kw.db)" };
}

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const port = Number(env.PORT ?? 4600);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid PORT: ${env.PORT}`);
  return port;
}
