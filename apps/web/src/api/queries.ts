import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { FindingStatusUpdateBody, FindingsQueryInput, RunEventsQueryInput, RunsQueryInput, SafeguardsQueryInput } from "@kw/schema";
import { api } from "./client";

export const queryKeys = {
  health: ["health"] as const,
  overview: ["overview"] as const,
  runs: (q?: RunsQueryInput) => (q ? (["runs", q] as const) : (["runs"] as const)),
  run: (id: string) => ["run", id] as const,
  runEvents: (id: string, q?: RunEventsQueryInput) => (q ? (["runEvents", id, q] as const) : (["runEvents", id] as const)),
  runFindings: (id: string) => ["runFindings", id] as const,
  findings: (q?: FindingsQueryInput) => (q ? (["findings", q] as const) : (["findings"] as const)),
  finding: (id: string) => ["finding", id] as const,
  safeguards: (q?: SafeguardsQueryInput) => (q ? (["safeguards", q] as const) : (["safeguards"] as const)),
  evidence: (id: string) => ["evidence", id] as const,
  settings: ["settings"] as const,
};

export const useOverview = () => useQuery({ queryKey: queryKeys.overview, queryFn: api.overview });

export const useRuns = (q: RunsQueryInput) =>
  useQuery({ queryKey: queryKeys.runs(q), queryFn: () => api.runs(q), placeholderData: keepPreviousData });

export const useRun = (id: string) => useQuery({ queryKey: queryKeys.run(id), queryFn: () => api.run(id) });

export const useRunEvents = (id: string, q: RunEventsQueryInput) =>
  useQuery({ queryKey: queryKeys.runEvents(id, q), queryFn: () => api.runEvents(id, q), placeholderData: keepPreviousData });

export const useRunFindings = (id: string) => useQuery({ queryKey: queryKeys.runFindings(id), queryFn: () => api.runFindings(id) });

export const useFindings = (q: FindingsQueryInput) =>
  useQuery({ queryKey: queryKeys.findings(q), queryFn: () => api.findings(q), placeholderData: keepPreviousData });

export const useFinding = (id: string) => useQuery({ queryKey: queryKeys.finding(id), queryFn: () => api.finding(id) });

export const useSafeguards = (q: SafeguardsQueryInput) =>
  useQuery({ queryKey: queryKeys.safeguards(q), queryFn: () => api.safeguards(q), placeholderData: keepPreviousData });

export const useEvidence = (id: string | null) =>
  useQuery({ queryKey: queryKeys.evidence(id ?? ""), queryFn: () => api.evidence(id!), enabled: id !== null });

export const useSettingsStatus = () => useQuery({ queryKey: queryKeys.settings, queryFn: api.settingsStatus });

/** Everything that displays finding status or counts derived from it. */
export function invalidateAfterFindingChange(qc: QueryClient, findingId: string, runId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.finding(findingId) }),
    qc.invalidateQueries({ queryKey: queryKeys.findings() }),
    qc.invalidateQueries({ queryKey: queryKeys.runFindings(runId) }),
    qc.invalidateQueries({ queryKey: queryKeys.run(runId) }),
    qc.invalidateQueries({ queryKey: queryKeys.runs() }),
    qc.invalidateQueries({ queryKey: queryKeys.overview }),
    qc.invalidateQueries({ queryKey: queryKeys.safeguards() }),
    qc.invalidateQueries({ queryKey: ["evidence"] }),
  ]);
}

export function useUpdateFindingStatus(findingId: string, runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FindingStatusUpdateBody) => api.updateFindingStatus(findingId, body),
    onSuccess: () => invalidateAfterFindingChange(qc, findingId, runId),
  });
}
