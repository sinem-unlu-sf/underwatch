import type { Event, EventCorrelation } from "@kw/schema";
import { BasisBadge, Badge, OutcomeBadge, SourceBadge } from "../badges";
import { Time } from "../ui";
import { humanize, truncate } from "../../lib/format";

/**
 * Side-by-side "Agent reported | Independently observed" comparison for one finding. Rows come only from the finding's
 * related events and the run's stored correlation records (derived by the Kernel Witness correlator). Nothing is paired
 * by guesswork: an event without a correlation gets its own row, explicitly marked as having no counterpart.
 */

export type ComparisonRow = {
  key: string;
  reported: Event | null;
  observed: Event[];
  /** Correlations that produced this row (empty when the row is unpaired). */
  correlations: EventCorrelation[];
  /** For an observed-only row: a correlated reported event that exists but is not linked to this finding. */
  outsideReportedId?: string | null;
  /** For a reported row: correlations whose observed event exists in the run but is not linked to this finding. */
  outsideObserved?: { total: number; matched: number };
};

export function buildComparisonRows(events: readonly Event[], correlations: readonly EventCorrelation[] | null): ComparisonRow[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const reported = events.filter((e) => e.basis === "reported");
  const observed = events.filter((e) => e.basis === "observed");
  const cors = (correlations ?? []).filter(
    (c) => (c.reported_event_id && byId.has(c.reported_event_id)) || (c.observed_event_id && byId.has(c.observed_event_id)),
  );
  const pairedObserved = new Set<string>();
  const rows: ComparisonRow[] = [];
  for (const r of reported) {
    const mine = cors.filter((c) => c.reported_event_id === r.id);
    const obs = mine.flatMap((c) => {
      const o = c.observed_event_id ? byId.get(c.observed_event_id) : undefined;
      return o && o.basis === "observed" ? [o] : [];
    });
    obs.forEach((o) => pairedObserved.add(o.id));
    const outsideCors = mine.filter((c) => c.observed_event_id && !byId.has(c.observed_event_id));
    const outsideObserved = { total: outsideCors.length, matched: outsideCors.filter((c) => c.match === "matched").length };
    rows.push({ key: r.id, reported: r, observed: [...new Map(obs.map((o) => [o.id, o])).values()], correlations: mine, outsideObserved });
  }
  for (const o of observed) {
    if (pairedObserved.has(o.id)) continue;
    const mine = cors.filter((c) => c.observed_event_id === o.id);
    const outside = mine.find((c) => c.reported_event_id && !byId.has(c.reported_event_id))?.reported_event_id ?? null;
    rows.push({ key: o.id, reported: null, observed: [o], correlations: mine, outsideReportedId: outside });
  }
  const first = (row: ComparisonRow) => Math.min(...[row.reported, ...row.observed].filter((e): e is Event => !!e).map((e) => Date.parse(e.timestamp)));
  return rows.sort((a, b) => first(a) - first(b));
}

/** Observed resource-level events say more about the outcome than a process start. */
const OBS_WEIGHT: Partial<Record<Event["event_type"], number>> = {
  file_read: 5,
  file_write: 5,
  file_create: 5,
  file_delete: 5,
  file_rename: 5,
  network_connect: 5,
  repo_change: 5,
  dns_query: 4,
  file_open: 3,
  process_exec: 1,
};

export type KeyPair = { reported: Event | null; observed: Event | null; correlation: EventCorrelation | null; kind: "paired" | "reported_only" | "observed_only" };

/** The single most relevant "agent said -> kernel saw" pair, from real rows only. Null when there is nothing to compare. */
export function pickKeyPair(rows: readonly ComparisonRow[]): KeyPair | null {
  const paired = rows.filter((r) => r.reported && r.observed.length > 0);
  if (paired.length > 0) {
    // Prefer the agent's own final claim, then the most outcome-revealing observation, then the latest.
    const scored = paired.flatMap((r) =>
      r.observed.map((o) => ({
        r,
        o,
        score: (r.reported!.event_type === "agent_message" ? 100 : 0) + (OBS_WEIGHT[o.event_type] ?? 2) * 10,
        t: Date.parse(o.timestamp),
      })),
    );
    scored.sort((a, b) => b.score - a.score || b.t - a.t);
    const best = scored[0]!;
    return { reported: best.r.reported, observed: best.o, correlation: best.r.correlations.find((c) => c.observed_event_id === best.o.id) ?? null, kind: "paired" };
  }
  const obsOnly = rows.filter((r) => !r.reported && r.observed.length > 0);
  if (obsOnly.length > 0) {
    const best = [...obsOnly].sort((a, b) => (OBS_WEIGHT[b.observed[0]!.event_type] ?? 2) - (OBS_WEIGHT[a.observed[0]!.event_type] ?? 2))[0]!;
    return { reported: null, observed: best.observed[0]!, correlation: best.correlations[0] ?? null, kind: "observed_only" };
  }
  const repOnly = rows.find((r) => r.reported);
  if (repOnly) return { reported: repOnly.reported, observed: null, correlation: repOnly.correlations[0] ?? null, kind: "reported_only" };
  return null;
}

function MatchNote({ row }: { row: ComparisonRow }) {
  const c = row.correlations.find((x) => x.match === "uncertain") ?? row.correlations[0];
  if (!c) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-fg-2">
      <Badge tone={c.match === "uncertain" ? "unknown" : "muted"} title="Correlation by Kernel Witness (derived, not raw evidence)">
        correlation: {humanize(c.match)} · {c.confidence}
      </Badge>
      {c.note ? <span>{truncate(c.note, 140)}</span> : null}
    </div>
  );
}

function EventButton({ event: e, onOpen }: { event: Event; onOpen: (id: string) => void }) {
  const accent = e.basis === "reported" ? "border-l-reported" : "border-l-observed";
  return (
    <button
      type="button"
      onClick={() => onOpen(e.id)}
      aria-label={`Inspect ${e.basis} event: ${e.summary}`}
      className={`block w-full rounded-[3px] border border-l-[3px] border-line bg-surface-2 px-2 py-1.5 text-left hover:border-line-strong ${accent}`}
    >
      <span className="flex flex-wrap items-center gap-1">
        <BasisBadge basis={e.basis} />
        <Badge tone="muted" mono>
          {e.event_type}
        </Badge>
        <OutcomeBadge outcome={e.outcome} />
        <span className="ml-auto">
          <SourceBadge source={e.source} />
        </span>
      </span>
      <span className="mt-1 block text-[12px] text-fg-0">{e.summary}</span>
      <span className="mt-0.5 block text-[11px] text-fg-2">
        <Time iso={e.timestamp} />
        {e.process_id !== null ? <span className="ml-2 font-mono">pid {e.process_id}</span> : null}
      </span>
    </button>
  );
}

function Gap({ text }: { text: string }) {
  return <div className="hatch rounded-[3px] px-2 py-1.5 text-[12px] text-unknown">{text}</div>;
}

export function ReportedVsObservedPanel({
  events,
  correlations,
  correlationStatus,
  onOpenEvidence,
}: {
  events: readonly Event[];
  correlations: readonly EventCorrelation[] | null;
  correlationStatus: "ready" | "loading" | "error";
  onOpenEvidence: (id: string) => void;
}) {
  const rows = buildComparisonRows(events, correlationStatus === "ready" ? correlations : null);
  const noCor = correlationStatus !== "ready";
  return (
    <section id="td-comparison" aria-labelledby="td-comparison-title" className="rounded-md border border-line bg-surface-1" data-testid="reported-vs-observed">
      <div className="border-b border-line px-3 py-2">
        <h2 id="td-comparison-title" className="text-[13px] font-semibold text-fg-0">
          Reported vs observed
        </h2>
        <p className="mt-0.5 text-[11.5px] text-fg-2">
          What the agent said it did, next to what was captured independently of it. Rows are aligned only where the Kernel Witness correlator
          recorded a match (derived); click any event to inspect its record.
        </p>
        {correlationStatus === "loading" ? <p className="mt-1 text-[11px] text-fg-2">Loading correlation records…</p> : null}
        {correlationStatus === "error" ? (
          <p role="status" className="mt-1 text-[11px] text-warn">
            Correlation records could not be loaded, so no rows are paired. The events below are shown unaligned.
          </p>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <div className="p-3">
          <Gap text="No agent-reported or independently observed event is linked to this finding, so there is nothing to compare." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="label w-1/2 px-3 py-1.5">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-reported" aria-hidden />
                  Agent reported
                </th>
                <th scope="col" className="label w-1/2 px-3 py-1.5">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-observed" aria-hidden />
                  Independently observed
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-line align-top last:border-b-0" data-testid="comparison-row">
                  <td className="px-3 py-2">
                    {row.reported ? (
                      <EventButton event={row.reported} onOpen={onOpenEvidence} />
                    ) : (
                      <Gap
                        text={
                          noCor
                            ? "Agent report unknown here (correlation records unavailable)."
                            : row.outsideReportedId
                              ? "Correlated agent report exists but is not linked to this finding."
                              : "Not reported by the agent: no correlated agent report."
                        }
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.observed.length > 0 ? (
                      <div className="space-y-1.5">
                        {row.observed.map((o) => (
                          <EventButton key={o.id} event={o} onOpen={onOpenEvidence} />
                        ))}
                      </div>
                    ) : (
                      <Gap
                        text={
                          noCor
                            ? "No matching observation shown (correlation records unavailable)."
                            : row.outsideObserved && row.outsideObserved.total > 0
                              ? `Correlated observations exist in this run (${row.outsideObserved.total} recorded, ${row.outsideObserved.matched} matched) but are not linked to this finding.`
                              : row.correlations.some((c) => c.match === "reported_only")
                                ? "No matching observation: the correlator found none for this report."
                                : "No matching observation recorded for this report."
                        }
                      />
                    )}
                    <MatchNote row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PairSide({ label, event, empty, onOpen }: { label: string; event: Event | null; empty: string; onOpen: (id: string) => void }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="label mb-0.5">{label}</div>
      {event ? (
        <button type="button" onClick={() => onOpen(event.id)} className="flex w-full flex-wrap items-center gap-1 text-left hover:underline" aria-label={`Inspect ${event.basis} event: ${event.summary}`}>
          <BasisBadge basis={event.basis} />
          <OutcomeBadge outcome={event.outcome} />
          <span className="min-w-0 text-[12px] text-fg-0">{truncate(event.summary, 110)}</span>
        </button>
      ) : (
        <span className="hatch inline-block rounded-[3px] px-1.5 py-0.5 text-[12px] text-unknown">{empty}</span>
      )}
    </div>
  );
}

/** Quick Read: one compact "Agent said -> Kernel saw" line with the most relevant real pair. */
export function AgentSaidKernelSaw({
  events,
  correlations,
  correlationStatus,
  onOpenEvidence,
  onSeeComparison,
}: {
  events: readonly Event[];
  correlations: readonly EventCorrelation[] | null;
  correlationStatus: "ready" | "loading" | "error";
  onOpenEvidence: (id: string) => void;
  onSeeComparison: () => void;
}) {
  if (correlationStatus === "loading") return null;
  const rows = buildComparisonRows(events, correlationStatus === "ready" ? correlations : null);
  const pair = pickKeyPair(rows);
  return (
    <section aria-labelledby="agent-said-title" className="border-t border-line pt-3" data-testid="agent-said-kernel-saw">
      <h3 id="agent-said-title" className="label mb-1">
        Agent said → Kernel saw
      </h3>
      {correlationStatus === "error" ? (
        <p role="status" className="text-[12px] text-unknown">
          Unknown: correlation records unavailable, so what the agent said cannot be paired with what the kernel saw. The full comparison lists
          both sides unaligned.
        </p>
      ) : !pair ? (
        <p className="text-[12px] text-fg-2">No agent-reported or observed event is linked to this finding, so there is no comparison to show.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <PairSide label="Agent said" event={pair.reported} empty="Nothing: the agent did not report this" onOpen={onOpenEvidence} />
            <span className="hidden pt-4 text-fg-2 sm:block" aria-hidden>
              →
            </span>
            <PairSide
              label="Kernel saw"
              event={pair.observed}
              empty="No matching observation"
              onOpen={onOpenEvidence}
            />
          </div>
          {pair.correlation ? (
            <p className="mt-1 text-[11px] text-fg-2">
              Paired by the Kernel Witness correlator (derived): {humanize(pair.correlation.match)}, {pair.correlation.confidence} confidence.
            </p>
          ) : null}
        </>
      )}
      <button type="button" className="mt-1.5 text-[12px] text-focus hover:underline" onClick={onSeeComparison}>
        See full comparison
      </button>
    </section>
  );
}
