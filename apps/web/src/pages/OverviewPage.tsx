import type { ComponentStatus, EntityTotals, FindingListItem, OverviewResponse, RunListItem } from "@kw/schema";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useOverview } from "../api/queries";
import {
  ApprovalBadge,
  ConfidenceBadge,
  FindingStatusBadge,
  FixtureBadge,
  IntegrationStatusBadge,
  RunStatusBadge,
  SeverityBadge,
  TriState,
  VerificationBadge,
} from "../components/badges";
import { Cmd, EmptyState, ErrorState, SkeletonBlock } from "../components/states";
import { Mono, PageHeader, Panel, Stat, Time } from "../components/ui";
import { truncate } from "../lib/format";

export function OverviewPage() {
  const q = useOverview();

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle={q.data ? <>Computed from persisted records at <Time iso={q.data.generated_at} /></> : "Computed from persisted records"}
      />
      {q.isPending ? <OverviewSkeleton /> : q.isError ? <ErrorState error={q.error} what="the overview" /> : <OverviewBody data={q.data} />}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4 rounded-[4px] border border-line bg-surface-1 p-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="w-28">
            <div className="skeleton mb-2 h-3 w-16" />
            <div className="skeleton h-6 w-10" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-[4px] border border-line bg-surface-1 p-3">
            <SkeletonBlock lines={4} />
          </div>
        ))}
      </div>
    </div>
  );
}

function breakdown(data: OverviewResponse, key: keyof EntityTotals) {
  return (
    <>
      fixture {data.breakdown.fixture[key]} · live {data.breakdown.live[key]}
    </>
  );
}

function OverviewBody({ data }: { data: OverviewResponse }) {
  const noRuns = data.totals.runs === 0;

  return (
    <div className="flex flex-col gap-3">
      {noRuns ? <FirstRunEmptyState /> : null}

      <section aria-label="Totals" className="flex flex-wrap rounded-[4px] border border-line bg-surface-1 py-2">
        <Stat label="Runs" value={data.totals.runs} breakdown={breakdown(data, "runs")} />
        <Stat label="Events" value={data.totals.events} breakdown={breakdown(data, "events")} />
        <Stat label="Findings" value={data.totals.findings} breakdown={breakdown(data, "findings")} />
        <Stat label="Safeguards" value={data.totals.safeguards} breakdown={breakdown(data, "safeguards")} />
        <Stat label="Verification runs" value={data.totals.verification_runs} breakdown={breakdown(data, "verification_runs")} />
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <CountedPanel title="Runs needing review" count={data.runs_needing_review.count} shown={data.runs_needing_review.items.length} more="/runs?has_findings=true">
          {data.runs_needing_review.items.length === 0 ? (
            <EmptyState title="No runs with open findings">Runs appear here when they have findings that are new, under review, or unresolved.</EmptyState>
          ) : (
            <RunMiniList runs={data.runs_needing_review.items} showOpen />
          )}
        </CountedPanel>

        <CountedPanel title="Recent runs" count={data.recent_runs.count} shown={data.recent_runs.items.length} more="/runs">
          {data.recent_runs.items.length === 0 ? <EmptyState title="No runs recorded" /> : <RunMiniList runs={data.recent_runs.items} />}
        </CountedPanel>

        <CountedPanel title="New discrepancies" count={data.new_findings.count} shown={data.new_findings.items.length} more="/findings?status=new">
          {data.new_findings.items.length === 0 ? (
            <EmptyState title="No new findings">Findings in status “new” have not been looked at yet.</EmptyState>
          ) : (
            <FindingMiniList findings={data.new_findings.items} />
          )}
        </CountedPanel>

        <CountedPanel
          title="Confirmed findings"
          count={data.confirmed_findings.count}
          shown={data.confirmed_findings.items.length}
          more="/findings?status=confirmed"
        >
          {data.confirmed_findings.items.length === 0 ? (
            <EmptyState title="No confirmed findings" />
          ) : (
            <FindingMiniList findings={data.confirmed_findings.items} />
          )}
        </CountedPanel>

        <CountedPanel
          title="Safeguards awaiting approval"
          count={data.safeguards_awaiting_approval.count}
          shown={data.safeguards_awaiting_approval.items.length}
          more="/safeguards?approval_status=proposed"
        >
          {data.safeguards_awaiting_approval.items.length === 0 ? (
            <EmptyState title="No proposed safeguards">Safeguard generation is pending architecture review.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {data.safeguards_awaiting_approval.items.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  <FixtureBadge isFixture={s.is_fixture} compact />
                  <ApprovalBadge status={s.approval_status} />
                  <Link to={`/safeguards?finding_id=${encodeURIComponent(s.finding_id)}`} className="min-w-0 flex-1 truncate hover:underline">
                    {s.title}
                  </Link>
                  <span className="text-fg-2">for</span>
                  <Link to={`/findings/${encodeURIComponent(s.finding_id)}`} className="max-w-[40%] truncate text-fg-1 hover:underline">
                    {s.finding_title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CountedPanel>

        <CountedPanel
          title="Recent verification results"
          count={data.recent_verification_results.count}
          shown={data.recent_verification_results.items.length}
        >
          {data.recent_verification_results.items.length === 0 ? (
            <EmptyState title="No completed verification runs">Verification runs are pending architecture review.</EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Safeguard</th>
                  <th>Result</th>
                  <th>Prohibited blocked</th>
                  <th>Legit worked</th>
                  <th>Ended</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_verification_results.items.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <FixtureBadge isFixture={v.is_fixture} compact />
                        {truncate(v.safeguard_title, 50)}
                      </span>
                    </td>
                    <td>{v.result ? <VerificationBadge status={v.result} /> : <TriState value={null} />}</td>
                    <td>
                      <TriState value={v.prohibited_behavior_blocked} />
                    </td>
                    <td>
                      <TriState value={v.legitimate_behavior_worked} />
                    </td>
                    <td>
                      <Time iso={v.ended_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CountedPanel>
      </div>

      <Panel
        title="Observation system health"
        aside={
          <>
            overall <IntegrationStatusBadge status={data.observation_health.overall} />
            <Link to="/settings" className="text-fg-1 hover:underline">
              settings
            </Link>
          </>
        }
        bodyClassName=""
      >
        <ComponentTable components={data.observation_health.components} />
      </Panel>
    </div>
  );
}

function FirstRunEmptyState() {
  return (
    <Panel title="No runs recorded yet">
      <div className="max-w-[80ch] space-y-2 text-fg-1">
        <p>
          A supervised run is created when Kernel Witness starts an agent task and records both what the agent reports and what independent
          observers capture.
        </p>
        <ol className="list-inside list-decimal space-y-1">
          <li>
            <span className="text-fg-0">Live runs</span> require the Claude Code adapter and at least one independent observer. Both are{" "}
            <span className="hatch rounded-[2px] px-1 text-unknown">pending architecture review</span> and cannot be started from this build.
          </li>
          <li>
            <span className="text-fg-0">Fixture runs</span> (hand-authored samples, badged FIXTURE everywhere) can be loaded to explore the UI:{" "}
            <Cmd>pnpm seed:fixtures</Cmd>
          </li>
        </ol>
      </div>
    </Panel>
  );
}

function CountedPanel({ title, count, shown, more, children }: { title: string; count: number; shown: number; more?: string; children: ReactNode }) {
  return (
    <Panel
      title={
        <>
          {title} <span className="ml-1 font-mono text-fg-0">{count}</span>
        </>
      }
      aside={
        count > shown && more ? (
          <Link to={more} className="text-[11px] text-fg-1 hover:underline">
            showing {shown} of {count} · view all
          </Link>
        ) : count > shown ? (
          <span className="text-[11px]">
            showing {shown} of {count}
          </span>
        ) : more && count > 0 ? (
          <Link to={more} className="text-[11px] text-fg-1 hover:underline">
            view all
          </Link>
        ) : null
      }
      bodyClassName=""
    >
      {children}
    </Panel>
  );
}

function RunMiniList({ runs, showOpen }: { runs: RunListItem[]; showOpen?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {runs.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
          <FixtureBadge isFixture={r.is_fixture} compact />
          <Link to={`/runs/${encodeURIComponent(r.id)}`} className="min-w-0 flex-1 truncate hover:underline" title={r.task_description}>
            {r.label ?? <Mono>{r.id}</Mono>}
          </Link>
          {showOpen ? (
            <>
              {r.max_open_severity ? <SeverityBadge severity={r.max_open_severity} /> : null}
              <span className="text-[11px] text-fg-1">
                {r.open_finding_count} open
              </span>
            </>
          ) : (
            <span className="text-[11px] text-fg-2">
              {r.event_count} ev · {r.finding_count} fnd
            </span>
          )}
          <RunStatusBadge status={r.status} />
          <Time iso={r.started_at} className="text-fg-2" />
        </li>
      ))}
    </ul>
  );
}

function FindingMiniList({ findings }: { findings: FindingListItem[] }) {
  return (
    <ul className="divide-y divide-line">
      {findings.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
          <FixtureBadge isFixture={f.is_fixture} compact />
          <SeverityBadge severity={f.severity} />
          <Link to={`/findings/${encodeURIComponent(f.id)}`} className="min-w-0 flex-1 truncate hover:underline">
            {f.title}
          </Link>
          <ConfidenceBadge confidence={f.confidence} />
          <FindingStatusBadge status={f.status} />
        </li>
      ))}
    </ul>
  );
}

export function ComponentTable({ components }: { components: ComponentStatus[] }) {
  if (components.length === 0) return <EmptyState title="No components reported" />;
  return (
    <div className="overflow-x-auto">
      <table className="data">
        <thead>
          <tr>
            <th>Component</th>
            <th>Status</th>
            <th>Detail</th>
            <th>Configured via</th>
          </tr>
        </thead>
        <tbody>
          {components.map((c) => (
            <tr key={c.id}>
              <td className="whitespace-nowrap text-fg-0">{c.name}</td>
              <td>
                <IntegrationStatusBadge status={c.status} />
              </td>
              <td className="text-fg-1">{c.detail}</td>
              <td>{c.configured_via ? <Mono className="text-fg-1">{c.configured_via}</Mono> : <span className="text-fg-2">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
