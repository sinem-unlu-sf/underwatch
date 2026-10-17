import {
  EventBasis,
  EventType,
  FINDING_STATUS_LABELS,
  FindingStatus,
  Outcome,
  type RunDetailResponse,
  type RunEventsQueryInput,
} from "@kw/schema";
import { useCallback, useMemo } from "react";
import { Link, useParams } from "react-router";
import { useRun, useRunEvents, useRunFindings } from "../api/queries";
import { BasisBadge, CoverageBadge, FixtureBadge, RunStatusBadge } from "../components/badges";
import { FindingsTable } from "../components/FindingsTable";
import { PolicyPanel } from "../components/PolicyPanel";
import { CoveragePanel } from "../components/run/CoveragePanel";
import { EventInspector } from "../components/run/EventInspector";
import { Timeline } from "../components/run/Timeline";
import { EmptyState, ErrorState, PageSkeleton, SkeletonRows } from "../components/states";
import { KeyValue, Mono, PageHeader, Panel, Time } from "../components/ui";
import { formatDuration, humanize } from "../lib/format";
import { pickEnum, useUrlFilters } from "../lib/searchParams";

const EVENT_FILTER_KEYS = ["event_type", "outcome", "process_id", "finding_id", "basis"];

export function RunDetailPage() {
  const { id = "" } = useParams();
  const run = useRun(id);

  if (run.isPending) return <PageSkeleton />;
  if (run.isError) {
    return (
      <div>
        <PageHeader title="Run" subtitle={<Mono>{id}</Mono>} />
        <ErrorState error={run.error} what="this run" />
        <Link to="/runs" className="ml-3 text-focus hover:underline">
          Back to runs
        </Link>
      </div>
    );
  }
  return <RunWorkspace runId={id} detail={run.data} />;
}

function RunWorkspace({ runId, detail }: { runId: string; detail: RunDetailResponse }) {
  const { run, policy, coverage, counts } = detail;
  const { get, set, clear } = useUrlFilters();
  const findings = useRunFindings(runId);

  const processRaw = get("process_id");
  const eventQuery: RunEventsQueryInput = {
    event_type: pickEnum(get("event_type"), EventType.options),
    outcome: pickEnum(get("outcome"), Outcome.options),
    process_id: processRaw && /^\d+$/.test(processRaw) ? Number(processRaw) : undefined,
    finding_id: /^fnd_[A-Za-z0-9_-]+$/.test(get("finding_id") ?? "") ? get("finding_id") : undefined,
    basis: pickEnum(get("basis"), EventBasis.options),
  };
  const filtered = EVENT_FILTER_KEYS.some((k) => get(k) !== undefined);
  const events = useRunEvents(runId, eventQuery);
  // Unfiltered list (same cache entry as the default view) for process options and correlation lookups.
  const allEvents = useRunEvents(runId, {});

  const selectedId = get("event") ?? null;
  const select = useCallback((eventId: string) => set({ event: eventId, offset: undefined }, { replace: true }), [set]);
  const closeInspector = useCallback(() => set({ event: undefined, offset: undefined }, { replace: true }), [set]);

  const processOptions = useMemo(() => {
    const m = new Map<number, string | null>();
    for (const e of allEvents.data?.items ?? []) if (e.process_id !== null && !m.has(e.process_id)) m.set(e.process_id, e.process_name);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [allEvents.data]);

  const selectedEvent =
    (selectedId && (events.data?.items.find((e) => e.id === selectedId) ?? allEvents.data?.items.find((e) => e.id === selectedId))) || null;
  const correlations = events.data?.correlations ?? allEvents.data?.correlations ?? [];
  const selectedCorrelations = selectedId ? correlations.filter((c) => c.reported_event_id === selectedId || c.observed_event_id === selectedId) : [];

  return (
    <div className={selectedId ? "lg:pr-[500px]" : undefined}>
      <PageHeader
        title={
          <>
            <FixtureBadge isFixture={run.is_fixture} />
            <span>{run.label ?? run.id}</span>
            <RunStatusBadge status={run.status} />
            <CoverageBadge level={run.coverage_status} />
          </>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3">
            <Mono>{run.id}</Mono>
            <Link to="/runs" className="text-fg-1 hover:underline">
              all runs
            </Link>
          </span>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Run summary">
          <KeyValue
            items={[
              ["Agent", run.agent_type === "claude_code" ? "Claude Code" : run.agent_type],
              ["Adapter", run.adapter ? <Mono>{run.adapter}</Mono> : <span className="text-fg-2">none recorded</span>],
              ["Started", <Time iso={run.started_at} />],
              [
                "Ended",
                run.ended_at ? (
                  <>
                    <Time iso={run.ended_at} /> <span className="text-fg-2">({formatDuration(run.started_at, run.ended_at)})</span>
                  </>
                ) : (
                  <span className="text-fg-2">not ended</span>
                ),
              ],
              ["Repository", run.repository_id ? <Mono>{run.repository_id}</Mono> : <span className="text-fg-2">not recorded</span>],
              ["Revision", run.repository_revision ? <Mono>{run.repository_revision}</Mono> : <span className="text-fg-2">not recorded</span>],
              [
                "Events",
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{counts.events}</span>
                  {EventBasis.options.map((b) => (
                    <span key={b} className="inline-flex items-center gap-1">
                      <BasisBadge basis={b} />
                      <span className="font-mono text-fg-1">{counts.events_by_basis[b] ?? 0}</span>
                    </span>
                  ))}
                </span>,
              ],
              ["Evidence records", <span className="font-mono">{counts.evidence}</span>],
              [
                "Findings",
                <span className="flex flex-wrap items-center gap-x-3">
                  <span className="font-mono">{counts.findings}</span>
                  <span className={counts.open_findings > 0 ? "text-warn" : "text-fg-2"}>{counts.open_findings} open</span>
                  <span className="text-[11px] text-fg-2">
                    {FindingStatus.options
                      .filter((s) => (counts.findings_by_status[s] ?? 0) > 0)
                      .map((s) => `${FINDING_STATUS_LABELS[s]} ${counts.findings_by_status[s]}`)
                      .join(" · ")}
                  </span>
                </span>,
              ],
            ]}
          />
        </Panel>
        <Panel title="Task">
          <p className="whitespace-pre-wrap text-fg-0">{run.task_description || <span className="text-fg-2">No task description recorded.</span>}</p>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CoveragePanel coverage={coverage} runLevel={run.coverage_status} />
        <PolicyPanel policy={policy} title="Applicable policy" />
      </div>

      <Panel
        className="mt-3"
        title={`Findings${findings.data ? ` (${findings.data.total})` : ""}`}
        bodyClassName=""
        id="findings"
      >
        {findings.isPending ? (
          <SkeletonRows rows={3} cols={6} />
        ) : findings.isError ? (
          <ErrorState error={findings.error} what="findings for this run" />
        ) : findings.data.items.length === 0 ? (
          <EmptyState title="No findings for this run">
            No discrepancy has been recorded for this run. That is a statement about recorded findings, not proof of correct behavior; check the
            coverage panel for what was observable.
          </EmptyState>
        ) : (
          <FindingsTable findings={findings.data.items} showRun={false} onFilterTimeline={(fid) => set({ finding_id: fid })} />
        )}
      </Panel>

      <Panel
        className="mt-3"
        id="timeline"
        title={`Event timeline${events.data ? ` (${events.data.total}${filtered ? " matching" : ""})` : ""}`}
        aside={<span className="text-[11px]">reported vs independently observed</span>}
        bodyClassName=""
      >
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-3">
          <FilterSelect
            label="Event type"
            value={eventQuery.event_type}
            onChange={(v) => set({ event_type: v })}
            options={EventType.options.map((t) => [t, t])}
          />
          <FilterSelect label="Outcome" value={eventQuery.outcome} onChange={(v) => set({ outcome: v })} options={Outcome.options.map((o) => [o, o])} />
          <FilterSelect
            label="Process"
            value={eventQuery.process_id !== undefined ? String(eventQuery.process_id) : undefined}
            onChange={(v) => set({ process_id: v })}
            options={processOptions.map(([pid, name]) => [String(pid), `${pid}${name ? ` ${name}` : ""}`])}
          />
          <FilterSelect
            label="Finding"
            value={eventQuery.finding_id}
            onChange={(v) => set({ finding_id: v })}
            options={(findings.data?.items ?? []).map((f) => [f.id, f.title.length > 48 ? `${f.title.slice(0, 47)}…` : f.title])}
          />
          <FilterSelect label="Lane" value={eventQuery.basis} onChange={(v) => set({ basis: v })} options={EventBasis.options.map((b) => [b, humanize(b)])} />
          {filtered ? (
            <button type="button" className="btn" onClick={() => clear(EVENT_FILTER_KEYS)}>
              Clear filters
            </button>
          ) : null}
        </div>
        {events.isPending ? (
          <SkeletonRows rows={8} cols={3} />
        ) : events.isError ? (
          <ErrorState error={events.error} what="events" />
        ) : events.data.items.length === 0 ? (
          filtered ? (
            <EmptyState title="No events match these filters" />
          ) : (
            <EmptyState title="No events recorded for this run">
              Nothing was captured, or no collector was active. See the coverage panel; an empty timeline is not evidence that nothing happened.
            </EmptyState>
          )
        ) : (
          <Timeline
            events={events.data.items}
            correlations={events.data.correlations}
            findings={findings.data?.items ?? []}
            selectedId={selectedId}
            onSelect={select}
          />
        )}
      </Panel>

      {selectedId ? (
        <EventInspector
          eventId={selectedId}
          event={selectedEvent}
          correlations={selectedCorrelations}
          onSelect={select}
          onClose={closeInspector}
          onClearFilters={() => clear(EVENT_FILTER_KEYS)}
        />
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <select className="field max-w-[260px]" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
