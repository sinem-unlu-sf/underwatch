import {
  OPEN_FINDING_STATUSES,
  SEVERITY_ORDER,
  outcomesForRun,
  type ComponentStatus,
  type Confidence,
  type EntityTotals,
  type FindingListItem,
  type OverviewResponse,
  type RunListItem,
  type SafeguardListItem,
} from "@kw/schema";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useFindings, useOverview, useSafeguards } from "../api/queries";
import {
  ApplicationBadge,
  ApprovalBadge,
  Badge,
  ConfidenceBadge,
  CoverageBadge,
  FindingStatusBadge,
  FixtureBadge,
  IntegrationStatusBadge,
  RunStatusBadge,
  SeverityBadge,
  TriState,
  VerificationBadge,
} from "../components/badges";
import { Icon, Notice, Section } from "../components/ds";
import { Cmd, EmptyState, ErrorState, LoadingState, SkeletonBlock } from "../components/states";
import { Mono, PageHeader, Time } from "../components/ui";
import { truncate } from "../lib/format";

/**
 * Overview: a calm starting point that answers three questions, in this order, from persisted records only:
 *   1. What needs my attention?   (open findings ranked by severity then confidence, runs with open findings)
 *   2. What happened recently?    (recent runs with live/fixture + coverage caveats, recent verification results)
 *   3. What should I do next?     (safeguards awaiting a decision or with failed/inconclusive verification)
 * Plus a one-line observation-system status linking to Settings. No KPI cards, no charts, no derived scores.
 * Nothing refetches on its own: data loads once per visit (or after the user changes something elsewhere).
 */

/** Findings list request used to rank open findings. The API orders by created_at desc; ranking happens here. */
const OPEN_FINDINGS_QUERY = { limit: 500 } as const;
const ATTENTION_LIMIT = 6;
const SAFEGUARD_LIMIT = 6;
const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export function OverviewPage() {
  const q = useOverview();

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle={
          q.data ? (
            <>
              What needs attention, what happened recently, and what to do next. Computed from persisted records at <Time iso={q.data.generated_at} />.
            </>
          ) : (
            "What needs attention, what happened recently, and what to do next. Computed from persisted records."
          )
        }
      />
      {q.isPending ? <OverviewSkeleton /> : q.isError ? <ErrorState error={q.error} what="the overview" /> : <OverviewBody data={q.data} />}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i}>
          <div className="skeleton mb-3 h-4 w-40" />
          <div className="rounded-md border border-line p-3">
            <SkeletonBlock lines={3} />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- ranking helpers (exported for tests) ------------------------------------------------------------------------

export function isOpenFinding(f: { status: string }): boolean {
  return (OPEN_FINDING_STATUSES as readonly string[]).includes(f.status);
}

/** Open findings ordered by severity desc, then confidence desc, then most recently created. */
export function rankOpenFindings<T extends Pick<FindingListItem, "status" | "severity" | "confidence" | "created_at">>(findings: T[]): T[] {
  return findings
    .filter(isOpenFinding)
    .sort(
      (a, b) =>
        SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
        CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence] ||
        b.created_at.localeCompare(a.created_at),
    );
}

/** Why a safeguard needs a person, or null when it does not. Failed states first: they are unresolved problems. */
export function safeguardAction(s: Pick<SafeguardListItem, "approval_status" | "application_status" | "verification_status">): string | null {
  if (s.verification_status === "failed_verification") return "Verification failed for the tested scenario: review the result";
  if (s.application_status === "application_failed") return "Application failed: review and retry";
  if (s.verification_status === "verification_inconclusive") return "Verification inconclusive: the run did not establish the outcome";
  if (s.approval_status === "proposed") return "Proposed: awaiting approve or reject";
  return null;
}

const SAFEGUARD_ACTION_RANK = (s: SafeguardListItem) =>
  s.verification_status === "failed_verification" ? 0 : s.application_status === "application_failed" ? 1 : s.verification_status === "verification_inconclusive" ? 2 : 3;

// --- body --------------------------------------------------------------------------------------------------------

function OverviewBody({ data }: { data: OverviewResponse }) {
  const noRuns = data.totals.runs === 0;

  return (
    <div className="flex flex-col gap-10">
      <DataModeLine data={data} />

      {noRuns ? <FirstRunEmptyState /> : null}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:gap-8">
        <div className="flex min-w-0 flex-col gap-10">
          <AttentionSection data={data} />
          <RecentRunsSection data={data} />
        </div>
        <div className="flex min-w-0 flex-col gap-10">
          <SafeguardsSection data={data} />
          <SystemStatusSection components={data.observation_health.components} />
        </div>
      </div>

      <VerificationResultsSection data={data} />

      <RecordCounts data={data} />
    </div>
  );
}

/** Says plainly whether this page shows fixture data, live data, or both. Small text, never hidden. */
function DataModeLine({ data }: { data: OverviewResponse }) {
  const { fixture_runs, live_runs, contains_fixture_data } = data.data_mode;
  return (
    <p className="-mt-2 flex flex-wrap items-center gap-2 text-[12px] text-fg-2" data-testid="data-mode">
      {contains_fixture_data ? <FixtureBadge isFixture /> : null}
      <span>
        {live_runs} live {live_runs === 1 ? "run" : "runs"} · {fixture_runs} fixture {fixture_runs === 1 ? "run" : "runs"}
        {contains_fixture_data ? ". Fixture records are hand-authored samples, badged everywhere, and never count as live observations." : "."}
      </span>
    </p>
  );
}

// --- 1. attention --------------------------------------------------------------------------------------------------

function AttentionSection({ data }: { data: OverviewResponse }) {
  const findings = useFindings(OPEN_FINDINGS_QUERY);
  const ranked = findings.data ? rankOpenFindings(findings.data.items) : [];
  const listTruncated = findings.data ? findings.data.total > findings.data.items.length : false;
  const runs = data.runs_needing_review;

  return (
    <Section
      id="attention"
      title="Needs your attention"
      description="Open findings (new, under review, unresolved), highest severity first, then confidence."
      actions={
        <Link to="/findings?status=open" className="text-[12px] text-fg-1 hover:text-fg-0 hover:underline">
          All open findings
        </Link>
      }
    >
      <div className="rounded-md border border-line">
        {findings.isPending ? (
          <LoadingState label="Loading open findings…" />
        ) : findings.isError ? (
          <div className="p-3">
            <ErrorState error={findings.error} what="open findings" />
            {data.new_findings.items.length > 0 ? (
              <>
                <p className="mt-3 text-[12px] text-fg-2">Newest findings from the overview instead (not ranked):</p>
                <FindingList findings={data.new_findings.items} />
              </>
            ) : null}
          </div>
        ) : ranked.length === 0 ? (
          <EmptyState title="No open findings">
            Every recorded finding has been confirmed, resolved or dismissed. New discrepancies appear here after a supervised run.
            {listTruncated ? " Only the most recent findings were checked." : null}
          </EmptyState>
        ) : (
          <>
            <FindingList findings={ranked.slice(0, ATTENTION_LIMIT)} />
            <ListFooter
              shown={Math.min(ranked.length, ATTENTION_LIMIT)}
              total={ranked.length}
              noun="open findings"
              to="/findings?status=open"
              caveat={listTruncated ? `Ranked from the ${findings.data!.items.length} most recent of ${findings.data!.total} findings.` : undefined}
            />
          </>
        )}
      </div>

      {runs.count > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-[12.5px] font-medium text-fg-1">
            Runs with open findings <span className="font-mono text-fg-2">{runs.count}</span>
          </h3>
          <div className="rounded-md border border-line">
            <RunList runs={runs.items} showOpen />
            {runs.count > runs.items.length ? (
              <ListFooter shown={runs.items.length} total={runs.count} noun="runs" to="/runs?has_findings=true" />
            ) : null}
          </div>
        </div>
      ) : null}
    </Section>
  );
}

function FindingList({ findings }: { findings: FindingListItem[] }) {
  return (
    <ul className="divide-y divide-line" aria-label="Findings">
      {findings.map((f) => (
        <li key={f.id} className="flex flex-col gap-1 px-3 py-2.5 transition-colors duration-120 hover:bg-surface-2/50">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity} />
            <Link to={`/findings/${encodeURIComponent(f.id)}`} className="min-w-0 flex-1 truncate font-medium text-fg-0 hover:underline" title={f.title}>
              {f.title}
            </Link>
            <FixtureBadge isFixture={f.is_fixture} compact />
          </div>
          {f.description ? (
            <p className="truncate text-[12.5px] text-fg-2" title={f.description}>
              {f.description}
            </p>
          ) : f.recommended_next_step ? (
            <p className="truncate text-[12.5px] text-fg-2" title={f.recommended_next_step}>
              Next step: {f.recommended_next_step}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-fg-2">
            <FindingStatusBadge status={f.status} />
            <ConfidenceBadge confidence={f.confidence} />
            {f.run_label ? (
              <Link to={`/runs/${encodeURIComponent(f.run_id)}`} className="max-w-[16rem] truncate hover:text-fg-1 hover:underline" title={`Run: ${f.run_label}`}>
                {f.run_label}
              </Link>
            ) : (
              <Link to={`/runs/${encodeURIComponent(f.run_id)}`} className="hover:underline">
                <Mono>{truncate(f.run_id, 18)}</Mono>
              </Link>
            )}
            <Time iso={f.created_at} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// --- 2. recent activity ------------------------------------------------------------------------------------------

function RecentRunsSection({ data }: { data: OverviewResponse }) {
  const r = data.recent_runs;
  return (
    <Section
      id="recent-runs"
      title="Recent runs"
      description="Most recent supervised runs. Coverage caveats show where observation was partial or unknown."
      actions={
        <Link to="/runs" className="text-[12px] text-fg-1 hover:text-fg-0 hover:underline">
          All runs
        </Link>
      }
    >
      <div className="rounded-md border border-line">
        {r.items.length === 0 ? (
          <EmptyState title="No runs recorded" />
        ) : (
          <>
            <RunList runs={r.items} />
            {r.count > r.items.length ? <ListFooter shown={r.items.length} total={r.count} noun="runs" to="/runs" /> : null}
          </>
        )}
      </div>
    </Section>
  );
}

function RunList({ runs, showOpen }: { runs: RunListItem[]; showOpen?: boolean }) {
  return (
    <ul className="divide-y divide-line" aria-label="Runs">
      {runs.map((r) => (
        <li key={r.id} className="flex flex-col gap-1 px-3 py-2.5 transition-colors duration-120 hover:bg-surface-2/50">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/runs/${encodeURIComponent(r.id)}`} className="min-w-0 flex-1 truncate font-medium text-fg-0 hover:underline" title={r.task_description}>
              {r.label ?? <Mono>{r.id}</Mono>}
            </Link>
            {r.is_fixture ? <FixtureBadge isFixture /> : <span className="font-mono text-[10.5px] tracking-wider text-fg-2 uppercase">live</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-fg-2">
            <RunStatusBadge status={r.status} />
            {r.coverage_status !== "complete" ? <CoverageBadge level={r.coverage_status} /> : null}
            {showOpen ? (
              <>
                {r.max_open_severity ? <SeverityBadge severity={r.max_open_severity} /> : null}
                <span className="text-fg-1">{r.open_finding_count} open</span>
              </>
            ) : (
              <span>
                {r.event_count} events · {r.finding_count} findings
                {r.open_finding_count > 0 ? <span className="text-fg-1"> · {r.open_finding_count} open</span> : null}
              </span>
            )}
            <span>
              started <Time iso={r.started_at} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function VerificationResultsSection({ data }: { data: OverviewResponse }) {
  const v = data.recent_verification_results;
  return (
    <Section
      id="verification-results"
      title="Recent verification results"
      description="Security outcome and task outcome are separate: a blocked action implies neither task success nor failure. Results hold for the tested scenario only."
    >
      <div className="rounded-md border border-line">
        {v.items.length === 0 ? (
          <EmptyState title="No completed verification runs">Verification runs start from an approved safeguard's page; none have completed yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Safeguard</th>
                  <th title="Overall verification result for the tested scenario (legacy single field). It is not a task outcome.">Result</th>
                  <th title="Did the safeguard let the prohibited action through? (enforcement only)">Security outcome</th>
                  <th title="Independent completion checks only. A blocked action implies neither task success nor failure; agent claims never count.">Task outcome</th>
                </tr>
              </thead>
              <tbody>
                {v.items.map((r) => (
                  <tr key={r.id}>
                    <td className="min-w-[180px]">
                      <span className="flex items-center gap-1.5">
                        <FixtureBadge isFixture={r.is_fixture} compact />
                        <Link to={`/safeguards/${encodeURIComponent(r.safeguard_id)}`} className="hover:underline" title={r.safeguard_title}>
                          {truncate(r.safeguard_title, 50)}
                        </Link>
                      </span>
                      <span className="text-[11px] text-fg-2">
                        ended <Time iso={r.ended_at} />
                      </span>
                    </td>
                    <td>{r.result ? <VerificationBadge status={r.result} /> : <TriState value={null} />}</td>
                    <OutcomeCells run={r} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {v.count > v.items.length ? (
          <p className="border-t border-line px-3 py-2 text-[11.5px] text-fg-2">
            Showing {v.items.length} of {v.count} completed verification runs. Each safeguard's page lists its full history.
          </p>
        ) : null}
      </div>
    </Section>
  );
}

// --- 3. next actions ---------------------------------------------------------------------------------------------

function SafeguardsSection({ data }: { data: OverviewResponse }) {
  const sg = useSafeguards({});
  const needing = sg.data
    ? sg.data.items.filter((s) => safeguardAction(s) !== null).sort((a, b) => SAFEGUARD_ACTION_RANK(a) - SAFEGUARD_ACTION_RANK(b) || b.created_at.localeCompare(a.created_at))
    : [];
  const confirmed = data.confirmed_findings;

  return (
    <Section
      id="safeguards-needing-action"
      title="Safeguards needing action"
      description="Proposed safeguards awaiting a decision, and failed or inconclusive verifications."
      actions={
        <Link to="/safeguards" className="text-[12px] text-fg-1 hover:text-fg-0 hover:underline">
          All safeguards
        </Link>
      }
    >
      <div className="rounded-md border border-line">
        {sg.isPending ? (
          <LoadingState label="Loading safeguards…" />
        ) : sg.isError ? (
          <div className="p-3">
            <ErrorState error={sg.error} what="safeguards" />
            {data.safeguards_awaiting_approval.items.length > 0 ? (
              <>
                <p className="mt-3 text-[12px] text-fg-2">Proposed safeguards from the overview instead:</p>
                <SafeguardList items={data.safeguards_awaiting_approval.items} />
              </>
            ) : null}
          </div>
        ) : needing.length === 0 ? (
          <EmptyState title="Nothing awaiting a decision">
            No proposed safeguards and no failed or inconclusive verifications. Safeguards are proposed from a finding's page.
          </EmptyState>
        ) : (
          <>
            <SafeguardList items={needing.slice(0, SAFEGUARD_LIMIT)} />
            {needing.length > SAFEGUARD_LIMIT ? <ListFooter shown={SAFEGUARD_LIMIT} total={needing.length} noun="safeguards" to="/safeguards" /> : null}
          </>
        )}
      </div>

      {confirmed.count > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-[12.5px] font-medium text-fg-1">
            Confirmed findings <span className="font-mono text-fg-2">{confirmed.count}</span>
          </h3>
          <p className="mb-2 text-[12px] text-fg-2">Confirmed by a reviewer. Open one to propose or review its safeguard.</p>
          <div className="rounded-md border border-line">
            <ul className="divide-y divide-line" aria-label="Confirmed findings">
              {confirmed.items.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2 transition-colors duration-120 hover:bg-surface-2/50">
                  <SeverityBadge severity={f.severity} />
                  <Link to={`/findings/${encodeURIComponent(f.id)}`} className="min-w-0 flex-1 truncate text-fg-0 hover:underline" title={f.title}>
                    {f.title}
                  </Link>
                  <FixtureBadge isFixture={f.is_fixture} compact />
                </li>
              ))}
            </ul>
            {confirmed.count > confirmed.items.length ? (
              <ListFooter shown={confirmed.items.length} total={confirmed.count} noun="confirmed findings" to="/findings?status=confirmed" />
            ) : null}
          </div>
        </div>
      ) : null}
    </Section>
  );
}

function SafeguardList({ items }: { items: SafeguardListItem[] }) {
  return (
    <ul className="divide-y divide-line" aria-label="Safeguards">
      {items.map((s) => {
        const why = safeguardAction(s);
        return (
          <li key={s.id} className="flex flex-col gap-1 px-3 py-2.5 transition-colors duration-120 hover:bg-surface-2/50">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/safeguards/${encodeURIComponent(s.id)}`} className="min-w-0 flex-1 truncate font-medium text-fg-0 hover:underline" title={s.title}>
                {s.title}
              </Link>
              <FixtureBadge isFixture={s.is_fixture} compact />
            </div>
            {why ? <p className="text-[12.5px] text-fg-2">{why}</p> : null}
            <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-fg-2">
              <ApprovalBadge status={s.approval_status} />
              {s.application_status === "application_failed" ? <ApplicationBadge status={s.application_status} /> : null}
              {s.verification_status !== "not_tested" ? <VerificationBadge status={s.verification_status} /> : null}
              <span className="min-w-0 truncate">
                for{" "}
                <Link to={`/findings/${encodeURIComponent(s.finding_id)}`} className="text-fg-1 hover:underline" title={s.finding_title}>
                  {truncate(s.finding_title, 60)}
                </Link>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// --- system status -----------------------------------------------------------------------------------------------

function SystemStatusSection({ components }: { components: ComponentStatus[] }) {
  const problems = components.filter((c) => c.status === "degraded" || c.status === "error");
  return (
    <Section
      id="system-status"
      title="Observation system"
      description={<HealthSummary components={components} />}
      actions={
        <Link to="/settings" className="text-[12px] text-fg-1 hover:text-fg-0 hover:underline">
          Settings
        </Link>
      }
    >
      {problems.length > 0 ? (
        <Notice tone="caution" title={`${problems.length} ${problems.length === 1 ? "component is" : "components are"} degraded or in error`} className="mb-3">
          {problems.map((p) => `${p.name}: ${p.detail}`).join(" · ")}
        </Notice>
      ) : null}
      {components.length === 0 ? (
        <div className="rounded-md border border-line">
          <EmptyState title="No components reported" />
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label="Components">
          {components.map((c) => (
            <li key={c.id} className="flex min-w-0 items-center justify-between gap-3 text-[12.5px]">
              <span className="min-w-0 truncate text-fg-1" title={c.detail}>
                {c.name}
              </span>
              <IntegrationStatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      )}
      {components.length > 0 ? (
        <details className="group mt-3">
          <summary className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-[12px] text-fg-2 select-none hover:text-fg-1">
            <Icon name="chevronRight" size={12} className="transition-transform duration-150 group-open:rotate-90" />
            Component details
          </summary>
          <div className="mt-2 rounded-md border border-line">
            <ComponentTable components={components} />
          </div>
        </details>
      ) : null}
    </Section>
  );
}

/** Small honest record counts with the fixture/live split. Not KPI cards: plain text at the bottom of the page. */
function RecordCounts({ data }: { data: OverviewResponse }) {
  const rows: Array<[string, keyof EntityTotals]> = [
    ["runs", "runs"],
    ["events", "events"],
    ["findings", "findings"],
    ["safeguards", "safeguards"],
    ["verification runs", "verification_runs"],
  ];
  return (
    <section aria-label="Record counts" className="border-t border-line pt-4 text-[11.5px] text-fg-2" data-testid="record-counts">
      <span className="mr-2 font-medium text-fg-1">Recorded</span>
      {rows.map(([label, key], i) => (
        <span key={key} className="whitespace-nowrap">
          {i > 0 ? <span className="mx-1.5 text-line-strong">·</span> : null}
          <span className="font-mono text-fg-1">{data.totals[key]}</span> {label}{" "}
          <span title="fixture · live">
            (fixture {data.breakdown.fixture[key]} · live {data.breakdown.live[key]})
          </span>
        </span>
      ))}
    </section>
  );
}

// --- shared bits -------------------------------------------------------------------------------------------------

function ListFooter({ shown, total, noun, to, caveat }: { shown: number; total: number; noun: string; to: string; caveat?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-[11.5px] text-fg-2">
      <span>
        Showing {shown} of {total} {noun}
        {caveat ? `. ${caveat}` : ""}
      </span>
      {total > shown ? (
        <Link to={to} className="inline-flex items-center gap-1 text-fg-1 hover:text-fg-0 hover:underline">
          View all <Icon name="chevronRight" size={11} />
        </Link>
      ) : null}
    </div>
  );
}

function FirstRunEmptyState() {
  return (
    <Section id="get-started" title="No runs recorded yet" description="Nothing has been observed, so there is nothing to review.">
      <div className="max-w-[80ch] space-y-3 rounded-md border border-line p-4 text-fg-1">
        <p>
          A supervised run is created when Kernel Witness starts an agent task and records both what the agent reports and what independent
          observers capture.
        </p>
        <ol className="list-inside list-decimal space-y-1.5">
          <li>
            <span className="text-fg-0">Live runs</span> require the Claude Code adapter and at least one independent observer. Start one from{" "}
            <Link to="/runs" className="text-fg-0 underline decoration-line-strong underline-offset-2 hover:decoration-fg-1">
              Agent Runs &gt; Start supervised run
            </Link>{" "}
            (Docker harness; sessions run outside Kernel Witness are not observed).
          </li>
          <li>
            <span className="text-fg-0">Fixture runs</span> (hand-authored samples, badged FIXTURE everywhere) can be loaded to explore the UI:{" "}
            <Cmd>pnpm seed:fixtures</Cmd>
          </li>
        </ol>
        <p className="text-[12px] text-fg-2">
          Check{" "}
          <Link to="/settings" className="text-fg-1 underline decoration-line-strong underline-offset-2 hover:decoration-fg-1">
            Settings
          </Link>{" "}
          to see which observers are connected before starting a live run.
        </p>
      </div>
    </Section>
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

/** Issue 4: security and task outcomes as two separate cells, each with its basis; never one merged verdict. */
function OutcomeCells({ run }: { run: Parameters<typeof outcomesForRun>[0] }) {
  const o = outcomesForRun(run);
  const s = o.security_outcome;
  const t = o.task_outcome;
  const basis = (b: string | null) => (b ? ` (${b})` : "");
  return (
    <>
      <td title={`${s.reason}${s.evidence_ids.length ? ` | evidence: ${s.evidence_ids.join(", ")}` : ""}`}>
        <Badge tone={s.value === "blocked" ? "verified" : s.value === "allowed" ? "risk" : "unknown"}>
          {s.value}
          {basis(s.basis)}
        </Badge>
      </td>
      <td title={`${t.reason}${t.evidence_ids.length ? ` | evidence: ${t.evidence_ids.join(", ")}` : ""}`}>
        <Badge tone={t.value === "succeeded" ? "verified" : t.value === "failed" ? "risk" : "unknown"}>
          {t.value}
          {basis(t.basis)}
        </Badge>
        {o.reported_task_claim?.claim === "claimed_success" && t.value !== "succeeded" ? <span className="ml-1 text-[11px] text-reported">agent claimed done (reported)</span> : null}
      </td>
    </>
  );
}

/**
 * Per-status counts instead of a single worst-of "overall" badge: a worst-of badge reads "not implemented" while the
 * kernel tracer, proxy and graph are working, which suggests nothing is observed.
 */
function HealthSummary({ components }: { components: Array<{ status: string }> }): ReactNode {
  const working = components.filter((c) => c.status === "connected" || c.status === "configured").length;
  const problem = components.filter((c) => c.status === "degraded" || c.status === "error").length;
  const absent = components.length - working - problem;
  return (
    <span title="Counts per component; see Component details for each component's status and detail.">
      {working} working{problem > 0 ? <span className="text-warn"> · {problem} degraded or error</span> : null} · {absent} not implemented, not configured or
      disabled
    </span>
  );
}
