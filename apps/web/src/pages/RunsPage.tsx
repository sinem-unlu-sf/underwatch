import { AgentType, FixtureFilter, RunStatus, type RunsQueryInput } from "@kw/schema";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useRuns } from "../api/queries";
import { CoverageBadge, FixtureBadge, RunStatusBadge, SeverityBadge } from "../components/badges";
import { Pager } from "../components/Pager";
import { Cmd, EmptyState, ErrorState, SkeletonRows } from "../components/states";
import { Field, Mono, PageHeader, Panel, Time } from "../components/ui";
import { humanize, isoToLocalInput, localInputToIso, timezoneLabel, truncate } from "../lib/format";
import { pickEnum, useUrlFilters } from "../lib/searchParams";

const PAGE_SIZE = 50;
const FILTER_KEYS = ["q", "agent", "status", "from", "to", "has_findings", "fixture"];

export function RunsPage() {
  const { get, set, clear } = useUrlFilters();
  const navigate = useNavigate();
  const offset = Number(get("offset") ?? 0) || 0;

  const query: RunsQueryInput = {
    q: get("q"),
    agent: pickEnum(get("agent"), AgentType.options),
    status: pickEnum(get("status"), RunStatus.options),
    from: get("from"),
    to: get("to"),
    has_findings: pickEnum(get("has_findings"), ["true", "false"] as const),
    fixture: pickEnum(get("fixture"), FixtureFilter.options),
    limit: PAGE_SIZE,
    offset,
  };
  const filtered = FILTER_KEYS.some((k) => get(k) !== undefined);
  const runs = useRuns(query);

  const [search, setSearch] = useState(query.q ?? "");
  useEffect(() => setSearch(get("q") ?? ""), [get]);
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    set({ q: search.trim() || undefined });
  };

  return (
    <div>
      <PageHeader title="Agent Runs" subtitle="Supervised agent sessions, most recent first." />

      <form onSubmit={onSearch} className="mb-3 flex flex-wrap items-end gap-3 rounded-[4px] border border-line bg-surface-1 p-3">
        <Field label="Search" htmlFor="runs-q">
          <span className="flex gap-1">
            <input
              id="runs-q"
              className="field w-64"
              placeholder="id, label or task text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="btn">
              Search
            </button>
          </span>
        </Field>
        <Field label="Agent">
          <select className="field" value={query.agent ?? ""} onChange={(e) => set({ agent: e.target.value })}>
            <option value="">Any</option>
            {AgentType.options.map((a) => (
              <option key={a} value={a}>
                {a === "claude_code" ? "Claude Code" : a}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Run status">
          <select className="field" value={query.status ?? ""} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any</option>
            {RunStatus.options.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Started from (${timezoneLabel})`}>
          <input
            type="datetime-local"
            className="field"
            value={isoToLocalInput(query.from ?? null)}
            onChange={(e) => set({ from: localInputToIso(e.target.value) })}
          />
        </Field>
        <Field label="Started to">
          <input
            type="datetime-local"
            className="field"
            value={isoToLocalInput(query.to ?? null)}
            onChange={(e) => set({ to: localInputToIso(e.target.value) })}
          />
        </Field>
        <Field label="Findings">
          <select className="field" value={query.has_findings ?? ""} onChange={(e) => set({ has_findings: e.target.value })}>
            <option value="">Any</option>
            <option value="true">Has findings</option>
            <option value="false">No findings</option>
          </select>
        </Field>
        <Field label="Data">
          <select className="field" value={query.fixture ?? "include"} onChange={(e) => set({ fixture: e.target.value === "include" ? undefined : e.target.value })}>
            <option value="include">Fixture + live</option>
            <option value="exclude">Live only</option>
            <option value="only">Fixtures only</option>
          </select>
        </Field>
        {filtered ? (
          <button type="button" className="btn" onClick={() => clear(FILTER_KEYS)}>
            Clear filters
          </button>
        ) : null}
      </form>

      <Panel bodyClassName="" title={runs.data ? `${runs.data.total} run${runs.data.total === 1 ? "" : "s"}` : "Runs"}>
        {runs.isPending ? (
          <SkeletonRows rows={8} cols={7} />
        ) : runs.isError ? (
          <ErrorState error={runs.error} what="runs" />
        ) : runs.data.items.length === 0 ? (
          filtered ? (
            <EmptyState title="No runs match these filters">
              <button type="button" className="btn mt-2" onClick={() => clear(FILTER_KEYS)}>
                Clear filters
              </button>
            </EmptyState>
          ) : (
            <EmptyState title="No runs recorded">
              Live runs require the Claude Code adapter, which is pending architecture review. Load hand-authored fixture runs with{" "}
              <Cmd>pnpm seed:fixtures</Cmd> to explore the UI.
            </EmptyState>
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Agent</th>
                    <th>Task</th>
                    <th>Started</th>
                    <th className="text-right">Events</th>
                    <th className="text-right">Findings</th>
                    <th>Coverage</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.items.map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/runs/${encodeURIComponent(r.id)}`)}>
                      <td className="max-w-[260px]">
                        <div className="flex items-center gap-1.5">
                          <FixtureBadge isFixture={r.is_fixture} />
                          <Link
                            to={`/runs/${encodeURIComponent(r.id)}`}
                            className="truncate font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.label ?? r.id}
                          </Link>
                        </div>
                        {r.label ? <Mono className="text-[11px] text-fg-2">{r.id}</Mono> : null}
                      </td>
                      <td className="whitespace-nowrap text-fg-1">{r.agent_type === "claude_code" ? "Claude Code" : r.agent_type}</td>
                      <td className="max-w-[360px] text-fg-1" title={r.task_description}>
                        {truncate(r.task_description, 110)}
                      </td>
                      <td>
                        <Time iso={r.started_at} />
                      </td>
                      <td className="text-right font-mono">{r.event_count}</td>
                      <td className="text-right whitespace-nowrap">
                        <span className="font-mono">{r.finding_count}</span>
                        {r.open_finding_count > 0 ? (
                          <span className="ml-1.5 inline-flex items-center gap-1">
                            <span className="text-[11px] text-warn">{r.open_finding_count} open</span>
                            {r.max_open_severity ? <SeverityBadge severity={r.max_open_severity} /> : null}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <CoverageBadge level={r.coverage_status} />
                      </td>
                      <td>
                        <RunStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager offset={offset} limit={PAGE_SIZE} total={runs.data.total} shown={runs.data.items.length} onChange={(o) => set({ offset: String(o) })} />
          </>
        )}
      </Panel>
    </div>
  );
}
