import type { Event, EventCorrelation, FindingListItem } from "@kw/schema";
import { useEffect, useMemo, useRef } from "react";
import { Badge, BasisBadge, CorrelationBadge, OutcomeBadge, SourceBadge } from "../badges";
import { formatTime, humanize, truncate } from "../../lib/format";

interface TimelineProps {
  events: Event[];
  correlations: EventCorrelation[];
  findings: FindingListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Two provenance lanes on a shared time axis: what the agent said it did (left) and what independent observers captured (right).
 * Derived records (Kernel Witness analysis) span both lanes and are visually neutral because they are not raw evidence.
 */
export function Timeline({ events, correlations, findings, selectedId, onSelect }: TimelineProps) {
  const correlationsByEvent = useMemo(() => {
    const m = new Map<string, EventCorrelation[]>();
    for (const c of correlations) {
      for (const id of [c.reported_event_id, c.observed_event_id]) {
        if (!id) continue;
        const list = m.get(id) ?? [];
        list.push(c);
        m.set(id, list);
      }
    }
    return m;
  }, [correlations]);

  const findingsByEvent = useMemo(() => {
    const m = new Map<string, FindingListItem[]>();
    for (const f of findings) {
      for (const id of f.related_event_ids) {
        const list = m.get(id) ?? [];
        list.push(f);
        m.set(id, list);
      }
    }
    return m;
  }, [findings]);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId || !containerRef.current) return;
    const el = containerRef.current.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedId, events]);

  return (
    <div ref={containerRef} role="list" aria-label="Event timeline">
      <div className="sticky top-0 z-10 grid grid-cols-[92px_1fr_1fr] gap-2 border-b border-line-strong bg-surface-1 px-3 py-1.5">
        <span className="label">Time</span>
        <span className="label flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-reported" aria-hidden /> Agent-reported
        </span>
        <span className="label flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-observed" aria-hidden /> Independently observed
        </span>
      </div>
      {events.map((e) => {
        const card = (
          <EventCard
            event={e}
            selected={e.id === selectedId}
            correlations={correlationsByEvent.get(e.id) ?? []}
            findings={findingsByEvent.get(e.id) ?? []}
            onSelect={onSelect}
          />
        );
        return (
          <div key={e.id} role="listitem" data-event-id={e.id} className="grid grid-cols-[92px_1fr_1fr] gap-2 border-b border-line px-3 py-1">
            <time dateTime={e.timestamp} title={e.timestamp} className="pt-1.5 font-mono text-[11px] text-fg-2">
              {formatTime(e.timestamp)}
            </time>
            {e.basis === "derived" ? (
              <div className="col-span-2">{card}</div>
            ) : e.basis === "reported" ? (
              <>
                <div>{card}</div>
                <div aria-hidden className="border-l border-dashed border-line" />
              </>
            ) : (
              <>
                <div aria-hidden className="border-r border-dashed border-line" />
                <div>{card}</div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventCard({
  event: e,
  selected,
  correlations,
  findings,
  onSelect,
}: {
  event: Event;
  selected: boolean;
  correlations: EventCorrelation[];
  findings: FindingListItem[];
  onSelect: (id: string) => void;
}) {
  const accent = e.basis === "reported" ? "border-l-reported" : e.basis === "observed" ? "border-l-observed" : "border-l-line-strong";
  return (
    <button
      type="button"
      onClick={() => onSelect(e.id)}
      aria-pressed={selected}
      className={`block w-full rounded-[3px] border border-l-[3px] px-2 py-1 text-left ${accent} ${
        selected ? "border-focus bg-surface-3" : "border-line bg-surface-2 hover:bg-surface-3"
      } ${e.basis === "derived" ? "border-dashed" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-1">
        <BasisBadge basis={e.basis} />
        <Badge tone="muted" mono>
          {e.event_type}
        </Badge>
        <OutcomeBadge outcome={e.outcome} />
        {e.collection_status !== "complete" ? (
          <Badge tone={e.collection_status === "error" ? "risk" : "warn"} title="Collection status of this record">
            {e.collection_status} capture
          </Badge>
        ) : null}
        {e.attribution_confidence === "low" ? <Badge tone="unknown">low attribution</Badge> : null}
        <span className="ml-auto">
          <SourceBadge source={e.source} />
        </span>
      </div>
      <div className="mt-1 text-[12px] text-fg-0">{e.summary}</div>
      {e.target_resource ? <div className="mt-0.5 font-mono text-[11px] break-all text-fg-1">{truncate(e.target_resource, 160)}</div> : null}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-2">
        {e.process_id !== null ? (
          <span className="font-mono">
            pid {e.process_id}
            {e.process_name ? ` ${e.process_name}` : ""}
          </span>
        ) : null}
        {e.tool_name ? <span className="font-mono">tool {e.tool_name}</span> : null}
        {e.limitations.length > 0 ? <span>{e.limitations.length} limitation{e.limitations.length === 1 ? "" : "s"}</span> : null}
        {e.unavailable_fields.length > 0 ? <span>{e.unavailable_fields.length} field{e.unavailable_fields.length === 1 ? "" : "s"} unavailable</span> : null}
        {correlations.map((c) => (
          <CorrelationBadge key={c.id} match={c.match} confidence={c.confidence} />
        ))}
        {findings.map((f) => (
          <Badge key={f.id} tone="warn" title={f.title}>
            finding: {truncate(humanize(f.category), 28)}
          </Badge>
        ))}
      </div>
    </button>
  );
}
