import {
  ApiError,
  EvidenceResponse,
  FindingDetailResponse,
  FindingStatusUpdateResponse,
  FindingsResponse,
  HealthResponse,
  OverviewResponse,
  RunDetailResponse,
  RunEventsResponse,
  RunFindingsResponse,
  RunsResponse,
  SafeguardsResponse,
  SettingsStatusResponse,
  apiPaths,
  type ApiErrorCode,
  type FindingStatusUpdateBody,
  type FindingsQueryInput,
  type RunEventsQueryInput,
  type RunsQueryInput,
  type SafeguardsQueryInput,
} from "@kw/schema";

/** Structural subset of a Zod schema; the web package does not depend on zod directly. */
interface ResponseSchema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } };
}

/**
 * unreachable: the API did not answer (server not running, or the dev proxy could not connect).
 * http: the API answered with an ApiError body.
 * contract: the API answered, but the body did not match the shared @kw/schema contract.
 */
export type ApiFailureKind = "unreachable" | "http" | "contract";

export class ApiRequestError extends Error {
  readonly kind: ApiFailureKind;
  readonly status: number | null;
  readonly code: ApiErrorCode | null;
  readonly details: unknown;
  readonly path: string;

  constructor(init: { kind: ApiFailureKind; message: string; path: string; status?: number | null; code?: ApiErrorCode | null; details?: unknown }) {
    super(init.message);
    this.name = "ApiRequestError";
    this.kind = init.kind;
    this.path = init.path;
    this.status = init.status ?? null;
    this.code = init.code ?? null;
    this.details = init.details;
  }
}

type QueryValue = string | number | boolean | null | undefined;

export function buildQuery(params: Record<string, QueryValue> | undefined): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request<T>(path: string, schema: ResponseSchema<T>, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  } catch (err) {
    throw new ApiRequestError({ kind: "unreachable", path, message: err instanceof Error ? err.message : "Network request failed" });
  }

  const text = await res.text();
  let body: unknown = undefined;
  let isJson = false;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  if (!res.ok) {
    const parsed = ApiError.safeParse(body);
    if (parsed.success) {
      throw new ApiRequestError({
        kind: "http",
        path,
        status: res.status,
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        details: parsed.data.error.details,
      });
    }
    // The Vite dev proxy answers 5xx with an empty/non-JSON body when it cannot reach the API.
    if (res.status >= 500 && !isJson) {
      throw new ApiRequestError({ kind: "unreachable", path, status: res.status, message: `API not reachable (HTTP ${res.status} from proxy)` });
    }
    throw new ApiRequestError({ kind: "contract", path, status: res.status, message: `HTTP ${res.status} with an error body that does not match ApiError`, details: body });
  }

  if (!isJson) {
    throw new ApiRequestError({ kind: "contract", path, status: res.status, message: "Response was not JSON" });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`);
    throw new ApiRequestError({ kind: "contract", path, status: res.status, message: "Response does not match the @kw/schema contract", details: issues });
  }
  return parsed.data;
}

export const api = {
  health: () => request(apiPaths.health(), HealthResponse),
  overview: () => request(apiPaths.overview(), OverviewResponse),
  runs: (q: RunsQueryInput) => request(apiPaths.runs() + buildQuery(q as Record<string, QueryValue>), RunsResponse),
  run: (id: string) => request(apiPaths.run(id), RunDetailResponse),
  runEvents: (id: string, q: RunEventsQueryInput) =>
    request(apiPaths.runEvents(id) + buildQuery(q as Record<string, QueryValue>), RunEventsResponse),
  runFindings: (id: string) => request(apiPaths.runFindings(id), RunFindingsResponse),
  findings: (q: FindingsQueryInput) => request(apiPaths.findings() + buildQuery(q as Record<string, QueryValue>), FindingsResponse),
  finding: (id: string) => request(apiPaths.finding(id), FindingDetailResponse),
  updateFindingStatus: (id: string, body: FindingStatusUpdateBody) =>
    request(apiPaths.findingStatus(id), FindingStatusUpdateResponse, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  safeguards: (q: SafeguardsQueryInput) => request(apiPaths.safeguards() + buildQuery(q as Record<string, QueryValue>), SafeguardsResponse),
  evidence: (id: string) => request(apiPaths.evidence(id), EvidenceResponse),
  settingsStatus: () => request(apiPaths.settingsStatus(), SettingsStatusResponse),
};
