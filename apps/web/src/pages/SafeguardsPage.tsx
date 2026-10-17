import {
  FixtureFilter,
  SAFEGUARD_TYPE_LABELS,
  SafeguardApplicationStatus,
  SafeguardApprovalStatus,
  SafeguardVerificationStatus,
  type SafeguardListItem,
  type SafeguardsQueryInput,
} from "@kw/schema";
import { Link } from "react-router";
import { useSafeguards } from "../api/queries";
import {
  ApplicationBadge,
  ApprovalBadge,
  FindingStatusBadge,
  FixtureBadge,
  TriState,
  VerificationBadge,
} from "../components/badges";
import { EmptyState, ErrorState, SkeletonBlock } from "../components/states";
import { Field, KeyValue, Mono, PageHeader, Panel, Time } from "../components/ui";
import { humanize } from "../lib/format";
import { pickEnum, useUrlFilters } from "../lib/searchParams";

const FILTER_KEYS = ["approval_status", "application_status", "verification_status", "finding_id", "fixture"];

export function SafeguardsPage() {
  const { get, set, clear } = useUrlFilters();
  const findingId = get("finding_id");
  const query: SafeguardsQueryInput = {
    approval_status: pickEnum(get("approval_status"), SafeguardApprovalStatus.options),
    application_status: pickEnum(get("application_status"), SafeguardApplicationStatus.options),
    verification_status: pickEnum(get("verification_status"), SafeguardVerificationStatus.options),
    finding_id: findingId && /^fnd_[A-Za-z0-9_-]+$/.test(findingId) ? findingId : undefined,
    fixture: pickEnum(get("fixture"), FixtureFilter.options),
  };
  const filtered = FILTER_KEYS.some((k) => get(k) !== undefined);
  const q = useSafeguards(query);

  return (
    <div>
      <PageHeader
        title="Safeguards"
        subtitle="Proposed and applied protections derived from findings. Each shows the exact content that would be applied and how."
      />

      <div className="mb-3 rounded-[4px] border border-line bg-surface-1 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Approval">
            <select className="field" value={query.approval_status ?? ""} onChange={(e) => set({ approval_status: e.target.value })}>
              <option value="">Any</option>
              {SafeguardApprovalStatus.options.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Application">
            <select className="field" value={query.application_status ?? ""} onChange={(e) => set({ application_status: e.target.value })}>
              <option value="">Any</option>
              {SafeguardApplicationStatus.options.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Verification">
            <select className="field" value={query.verification_status ?? ""} onChange={(e) => set({ verification_status: e.target.value })}>
              <option value="">Any</option>
              {SafeguardVerificationStatus.options.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <select className="field" value={query.fixture ?? "include"} onChange={(e) => set({ fixture: e.target.value === "include" ? undefined : e.target.value })}>
              <option value="include">Fixture + live</option>
              <option value="exclude">Live only</option>
              <option value="only">Fixtures only</option>
            </select>
          </Field>
          {query.finding_id ? (
            <div className="flex flex-col gap-1">
              <span className="label">Finding</span>
              <span className="flex items-center gap-1">
                <Mono>{query.finding_id}</Mono>
                <button type="button" className="btn" onClick={() => set({ finding_id: undefined })}>
                  Remove
                </button>
              </span>
            </div>
          ) : null}
          {filtered ? (
            <button type="button" className="btn" onClick={() => clear(FILTER_KEYS)}>
              Clear filters
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-fg-2">
          Generating, approving, applying and verifying safeguards is pending architecture review. This page lists recorded safeguards only.
        </p>
      </div>

      {q.isPending ? (
        <Panel>
          <SkeletonBlock lines={6} />
        </Panel>
      ) : q.isError ? (
        <Panel bodyClassName="">
          <ErrorState error={q.error} what="safeguards" />
        </Panel>
      ) : q.data.items.length === 0 ? (
        <Panel bodyClassName="">
          {filtered ? (
            <EmptyState title="No safeguards match these filters">
              <button type="button" className="btn mt-2" onClick={() => clear(FILTER_KEYS)}>
                Clear filters
              </button>
            </EmptyState>
          ) : (
            <EmptyState title="No safeguards recorded">
              A safeguard is proposed from a confirmed finding: a CLAUDE.md instruction, a Claude Code permission rule, a hook/policy check, or a
              regression test. Proposal and application are pending architecture review.
            </EmptyState>
          )}
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-[12px] text-fg-2">
            {q.data.total} safeguard{q.data.total === 1 ? "" : "s"}
          </div>
          {q.data.items.map((s) => (
            <SafeguardCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SafeguardCard({ s }: { s: SafeguardListItem }) {
  const v = s.last_verification;
  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2 normal-case">
          <FixtureBadge isFixture={s.is_fixture} />
          <span className="text-[13px] tracking-normal text-fg-0">{s.title}</span>
        </span>
      }
      aside={
        <>
          <ApprovalBadge status={s.approval_status} />
          <ApplicationBadge status={s.application_status} />
          <VerificationBadge status={s.verification_status} />
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <KeyValue
            items={[
              ["Type", SAFEGUARD_TYPE_LABELS[s.type]],
              ["Mechanism", s.application_mechanism],
              ["Target", s.target_path ? <Mono>{s.target_path}</Mono> : <span className="text-fg-2">not specified</span>],
              [
                "Linked finding",
                <span className="flex flex-wrap items-center gap-1.5">
                  <Link to={`/findings/${encodeURIComponent(s.finding_id)}`} className="text-focus hover:underline">
                    {s.finding_title}
                  </Link>
                  <FindingStatusBadge status={s.finding_status} />
                </span>,
              ],
              [
                "Run",
                <Link to={`/runs/${encodeURIComponent(s.run_id)}`} className="text-fg-1 hover:underline">
                  <Mono>{s.run_id}</Mono>
                </Link>,
              ],
              ["Created", <Time iso={s.created_at} />],
              ["Approved", s.approved_at ? <><Time iso={s.approved_at} /> {s.approved_by ? <span className="text-fg-2">by {s.approved_by}</span> : null}</> : <span className="text-fg-2">not approved</span>],
              ["Applied", s.applied_at ? <Time iso={s.applied_at} /> : <span className="text-fg-2">not applied</span>],
            ]}
          />
          <div>
            <div className="label mb-1">Intended effect</div>
            <p className="text-fg-1">{s.intended_effect}</p>
          </div>
          <div>
            <div className="label mb-1">Impact on legitimate workflows</div>
            <p className="text-fg-1">{s.legitimate_workflow_impact}</p>
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <div className="label mb-1">Exact content</div>
            <pre className="max-h-72 overflow-auto rounded-[3px] border border-line bg-surface-0 p-2 font-mono text-[12px] whitespace-pre-wrap text-fg-0">
              {s.content || "(empty)"}
            </pre>
          </div>
          <div>
            <div className="label mb-1">Last verification</div>
            {v ? (
              <div className="space-y-1.5 rounded-[3px] border border-line bg-surface-2 p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <FixtureBadge isFixture={v.is_fixture} compact />
                  {v.result ? <VerificationBadge status={v.result} /> : <span className="text-fg-2">{v.status}</span>}
                  <Mono className="text-[11px] text-fg-2">{v.id}</Mono>
                </div>
                <div className="text-[12px] text-fg-1">
                  Scenario <Mono>{v.scenario_id}</Mono>: {v.scenario_description}
                </div>
                <div className="grid grid-cols-[max-content_auto] items-center gap-x-3 gap-y-1 text-[12px]">
                  <span className="text-fg-2">Prohibited behavior attempted</span>
                  <TriState value={v.prohibited_behavior_attempted} />
                  <span className="text-fg-2">Prohibited behavior blocked</span>
                  <TriState value={v.prohibited_behavior_blocked} />
                  <span className="text-fg-2">Legitimate behavior worked</span>
                  <TriState value={v.legitimate_behavior_worked} />
                </div>
                {v.notes ? <p className="text-[12px] text-fg-1">{v.notes}</p> : null}
                <div className="text-[11px] text-fg-2">
                  <Time iso={v.started_at} /> → <Time iso={v.ended_at} />
                </div>
              </div>
            ) : (
              <div className="hatch rounded-[3px] px-2 py-1.5 text-unknown">Not verified: no verification run recorded.</div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
