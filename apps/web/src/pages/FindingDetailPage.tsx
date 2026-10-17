import { FINDING_STATUS_LABELS, type BundleEvidenceRef, type Event, type FindingDetailResponse } from "@kw/schema";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useFinding } from "../api/queries";
import { AskWitnessPanel } from "../components/askwitness/AskWitnessPanel";
import { EvidenceRefDrawer } from "../components/askwitness/EvidenceRef";
import { FindingSafeguardsPanel, type CreateSafeguardRequest } from "../components/safeguards/FindingSafeguardsPanel";
import {
  Badge,
  BasisBadge,
  CategoryLabel,
  FindingKindBadge,
  FindingStatusBadge,
  FixtureBadge,
  OutcomeBadge,
  RedactionBadge,
  SeverityBadge,
  SourceBadge,
} from "../components/badges";
import { FindingActions } from "../components/FindingActions";
import { EvidenceGraphPanel } from "../components/graph/EvidenceGraphPanel";
import { BackToFindings } from "../components/findings-modes/BackToFindings";
import { PolicyPanel } from "../components/PolicyPanel";
import { EmptyState, ErrorState, PageSkeleton } from "../components/states";
import { KeyValue, Mono, PageHeader, Panel, Time } from "../components/ui";
import { humanize, truncate } from "../lib/format";

export function FindingDetailPage() {
  const { id = "" } = useParams();
  const q = useFinding(id);

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) {
    return (
      <div>
        <PageHeader title="Finding" subtitle={<Mono>{id}</Mono>} />
        <ErrorState error={q.error} what="this finding" />
        <Link to="/findings" className="ml-3 text-focus hover:underline">
          Back to findings
        </Link>
      </div>
    );
  }
  return <FindingWorkspace data={q.data} />;
}

const timelineHref = (runId: string, eventId?: string) =>
  `/runs/${encodeURIComponent(runId)}${eventId ? `?event=${encodeURIComponent(eventId)}` : ""}`;

function FindingWorkspace({ data }: { data: FindingDetailResponse }) {
  const { finding: f, run } = data;
  const reported = data.related_events.filter((e) => e.basis === "reported");
  const observed = data.related_events.filter((e) => e.basis === "observed");
  const derived = data.related_events.filter((e) => e.basis === "derived");
  const [createReq, setCreateReq] = useState<CreateSafeguardRequest | null>(null);
  const requestSafeguard = (investigationId: string | null) => setCreateReq((r) => ({ investigationId, n: (r?.n ?? 0) + 1 }));
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  /** Page-local index so evidence ids cited by safeguards open the same drawer as Ask Witness citations. */
  const pageIndex = useMemo(() => {
    const m = new Map<string, BundleEvidenceRef>();
    m.set(f.id, { evidence_id: f.id, kind: "finding", basis: "derived", source: null, timestamp: f.created_at, summary: f.title, run_id: run.id });
    for (const e of data.related_events)
      m.set(e.id, { evidence_id: e.id, kind: "event", basis: e.basis, source: e.source, timestamp: e.timestamp, summary: e.summary, run_id: run.id });
    for (const ev of data.evidence)
      m.set(ev.id, { evidence_id: ev.id, kind: "evidence", basis: null, source: ev.source_type, timestamp: ev.timestamp, summary: ev.source_reference, run_id: ev.run_id });
    return m;
  }, [data, f, run.id]);

  return (
    <div>
      <BackToFindings className="mb-2 inline-block" />
      <PageHeader
        title={
          <>
            <FixtureBadge isFixture={f.is_fixture} />
            <span>{f.title}</span>
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="flex items-center gap-1.5">
            <span className="label">Status</span>
            <FindingStatusBadge status={f.status} />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="label">Severity</span>
            <SeverityBadge severity={f.severity} />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="label">Confidence</span>
            <Badge tone="muted">{f.confidence}</Badge>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="label">Category</span>
            <CategoryLabel category={f.category} />
            <FindingKindBadge finding={f} />
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-2">
          <Mono>{f.id}</Mono>
          <span>
            run{" "}
            <Link to={`/runs/${encodeURIComponent(run.id)}`} className="text-fg-1 hover:underline">
              {run.label ?? run.id}
            </Link>
          </span>
          <span>
            created <Time iso={f.created_at} />
          </span>
          <span>
            updated <Time iso={f.updated_at} />
          </span>
          {f.recurrence_of_finding_id ? (
            <span className="text-warn">
              possible recurrence of{" "}
              <Link to={`/findings/${encodeURIComponent(f.recurrence_of_finding_id)}`} className="font-mono hover:underline">
                {f.recurrence_of_finding_id}
              </Link>
            </span>
          ) : null}
        </div>
      </PageHeader>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Panel title="Why it was flagged">
            <p className="whitespace-pre-wrap text-fg-0">{f.description || <span className="text-fg-2">No description recorded.</span>}</p>
          </Panel>

          <Panel title="Reported vs observed" aside={<span className="text-[11px]">{data.related_events.length} related events</span>} bodyClassName="">
            <div className="grid md:grid-cols-2">
              <Lane
                title="Agent-reported"
                tone="reported"
                events={reported}
                runId={run.id}
                emptyText="No agent-reported event is linked. The agent did not report this action, or its report was not captured."
              />
              <Lane
                title="Independently observed"
                tone="observed"
                events={observed}
                runId={run.id}
                emptyText="No independently observed event is linked. The action was not observed, or no collector covered it."
                className="border-t border-line md:border-t-0 md:border-l"
              />
            </div>
            {derived.length > 0 ? (
              <div className="border-t border-line p-3">
                <div className="label mb-1.5">Derived by Kernel Witness (not raw evidence)</div>
                <div className="space-y-1.5">
                  {derived.map((e) => (
                    <EventSummaryCard key={e.id} event={e} runId={run.id} />
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title="Recommended next step">
            <p className="whitespace-pre-wrap text-fg-0">{f.recommended_next_step || <span className="text-fg-2">None recorded.</span>}</p>
          </Panel>

          <AskWitnessPanel
            finding={{ id: f.id, title: f.title, severity: f.severity, is_fixture: f.is_fixture }}
            onCreateSafeguard={requestSafeguard}
          />

          <FindingSafeguardsPanel findingId={f.id} safeguards={data.safeguards} request={createReq} onOpenEvidence={setOpenEvidence} />

          <Panel title={`Evidence references (${data.evidence.length})`} bodyClassName="">
            {data.evidence.length === 0 ? (
              <EmptyState title="No evidence records referenced">A finding without evidence cannot be verified; treat it with caution.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Evidence</th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Redaction</th>
                      <th>Excerpt</th>
                      <th>Timeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.evidence.map((ev) => {
                      const linked = data.related_events.filter((e) => e.evidence_id === ev.id);
                      return (
                        <tr key={ev.id}>
                          <td>
                            <span className="flex items-center gap-1.5">
                              <FixtureBadge isFixture={ev.is_fixture} compact />
                              <Mono className="text-[11px]">{ev.id}</Mono>
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-fg-1">{humanize(ev.source_type)}</td>
                          <td>
                            <Mono className="text-[11px]">{ev.source_reference}</Mono>
                          </td>
                          <td>
                            <RedactionBadge status={ev.redaction_status} />
                          </td>
                          <td className="max-w-[280px]">
                            {ev.excerpt !== null ? (
                              <Mono className="text-[11px] text-fg-1">{truncate(ev.excerpt, 140)}</Mono>
                            ) : (
                              <span className="hatch inline-block rounded-[2px] px-1 text-[11px] text-unknown">no excerpt</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            {linked.length > 0 ? (
                              linked.map((e) => (
                                <div key={e.id}>
                                  <Link to={timelineHref(run.id, e.id)} className="text-focus hover:underline">
                                    view {e.basis} event
                                  </Link>
                                </div>
                              ))
                            ) : (
                              <Link to={timelineHref(run.id)} className="text-fg-1 hover:underline" title="No related event points at this evidence record">
                                open run timeline
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <EvidenceGraphPanel findingId={f.id} onOpenEvidence={setOpenEvidence} />

          <Panel title="Missing information">
            {f.missing_information.length === 0 ? (
              <span className="text-fg-2">The finding records no evidence gaps.</span>
            ) : (
              <ul className="space-y-1">
                {f.missing_information.map((m, i) => (
                  <li key={i} className="hatch rounded-[2px] px-2 py-1 text-fg-1">
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <PolicyPanel policy={data.policy} highlightRuleId={f.policy_rule_id} title={f.policy_rule_id ? `Relevant policy · rule ${f.policy_rule_id}` : "Relevant policy"} />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Panel title="Actions">
            <FindingActions findingId={f.id} runId={run.id} status={f.status} serverAllowed={data.allowed_transitions} />
            <div className="mt-3 border-t border-line pt-3">
              <button type="button" className="btn" onClick={() => requestSafeguard(null)}>
                Create safeguard
              </button>
              <p className="mt-1 text-[11px] text-fg-2">Generates proposals for review. Nothing is applied without a diff and your approval.</p>
            </div>
          </Panel>

          <Panel title="Status history" bodyClassName="">
            {data.status_history.length === 0 ? (
              <EmptyState title="No status history recorded" />
            ) : (
              <ol className="divide-y divide-line">
                {data.status_history.map((h) => (
                  <li key={h.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                      {h.from ? (
                        <>
                          <span className="text-fg-2">{FINDING_STATUS_LABELS[h.from]}</span>
                          <span className="text-fg-2">→</span>
                        </>
                      ) : (
                        <span className="text-fg-2">created as</span>
                      )}
                      <FindingStatusBadge status={h.to} />
                      <FixtureBadge isFixture={h.is_fixture} compact />
                    </div>
                    <div className="mt-0.5 text-[11px] text-fg-2">
                      <Time iso={h.at} /> · {h.actor_type} <span className="font-mono">{h.actor}</span>
                    </div>
                    {h.note ? <p className="mt-1 text-[12px] whitespace-pre-wrap text-fg-1">{h.note}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>


          <Panel title="Run">
            <KeyValue
              items={[
                ["Run", <Link to={`/runs/${encodeURIComponent(run.id)}`} className="hover:underline">{run.label ?? <Mono>{run.id}</Mono>}</Link>],
                ["Task", <span className="text-fg-1">{truncate(run.task_description, 180)}</span>],
                ["Started", <Time iso={run.started_at} />],
                ["Coverage", <Badge tone={run.coverage_status === "unknown" ? "unknown" : run.coverage_status === "complete" ? "neutral" : "warn"}>{run.coverage_status}</Badge>],
              ]}
            />
          </Panel>
        </div>
      </div>
      {openEvidence ? <EvidenceRefDrawer id={openEvidence} evidenceRef={pageIndex.get(openEvidence)} onClose={() => setOpenEvidence(null)} /> : null}
    </div>
  );
}

function Lane({
  title,
  tone,
  events,
  runId,
  emptyText,
  className = "",
}: {
  title: string;
  tone: "reported" | "observed";
  events: Event[];
  runId: string;
  emptyText: string;
  className?: string;
}) {
  return (
    <div className={`p-3 ${className}`}>
      <div className="label mb-1.5 flex items-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${tone === "reported" ? "bg-reported" : "bg-observed"}`} aria-hidden />
        {title}
      </div>
      {events.length === 0 ? (
        <div className="hatch rounded-[3px] px-2 py-1.5 text-[12px] text-unknown">{emptyText}</div>
      ) : (
        <div className="space-y-1.5">
          {events.map((e) => (
            <EventSummaryCard key={e.id} event={e} runId={runId} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventSummaryCard({ event: e, runId }: { event: Event; runId: string }) {
  const accent = e.basis === "reported" ? "border-l-reported" : e.basis === "observed" ? "border-l-observed" : "border-l-line-strong border-dashed";
  return (
    <div className={`rounded-[3px] border border-l-[3px] border-line bg-surface-2 px-2 py-1.5 ${accent}`}>
      <div className="flex flex-wrap items-center gap-1">
        <BasisBadge basis={e.basis} />
        <Badge tone="muted" mono>
          {e.event_type}
        </Badge>
        <OutcomeBadge outcome={e.outcome} />
        <span className="ml-auto">
          <SourceBadge source={e.source} />
        </span>
      </div>
      <div className="mt-1 text-[12px]">{e.summary}</div>
      {e.target_resource ? <div className="font-mono text-[11px] break-all text-fg-1">{e.target_resource}</div> : null}
      {e.limitations.length > 0 ? (
        <ul className="mt-1 list-inside list-disc text-[11px] text-fg-2">
          {e.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-fg-2">
        <Time iso={e.timestamp} />
        {e.process_id !== null ? <span className="font-mono">pid {e.process_id}</span> : null}
        {e.attribution_confidence ? <Badge tone={e.attribution_confidence === "low" ? "unknown" : "muted"}>attribution: {e.attribution_confidence}</Badge> : null}
        <Link to={timelineHref(runId, e.id)} className="ml-auto text-focus hover:underline">
          view in timeline
        </Link>
      </div>
    </div>
  );
}
