import type { Confidence, FindingCategory, FindingStatus, Outcome, Severity } from "@kw/schema";
import { useCallback, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Badge, CategoryLabel, ConfidenceBadge, FindingStatusBadge, FixtureBadge, OutcomeBadge, SeverityBadge } from "../badges";
import { Mono } from "../ui";
import { findingHref } from "./useFindingsMode";

export interface FindingRowData {
  id: string;
  run_id: string;
  run_label: string | null;
  title: string;
  severity: Severity;
  confidence: Confidence;
  status: FindingStatus;
  category: FindingCategory;
  is_fixture: boolean;
}

/** Expanded-row state keyed by finding id; lives above the list so it survives a refresh of the data. */
export function useExpanded() {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback(
    (id: string) =>
      setOpen((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  return { isOpen: (id: string) => open.has(id), toggle };
}

/** One compact line per finding; metadata appears only when expanded. */
export function FindingRow({
  finding,
  expanded,
  onToggle,
  from,
  marker,
  showRun = true,
  children,
}: {
  finding: FindingRowData;
  expanded: boolean;
  onToggle: () => void;
  /** Href of the current findings view, so the finding page can link back to it. */
  from: string;
  marker?: "new" | "updated";
  showRun?: boolean;
  children?: ReactNode;
}) {
  const detailId = `finding-detail-${finding.id}`;
  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailId}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${finding.title}`}
          onClick={onToggle}
          className="w-4 shrink-0 text-left font-mono text-fg-2 hover:text-fg-0"
        >
          {expanded ? "▾" : "▸"}
        </button>
        <SeverityBadge severity={finding.severity} />
        <FixtureBadge isFixture={finding.is_fixture} compact />
        <Link to={findingHref(finding.id, from)} className="min-w-0 flex-1 truncate font-medium text-fg-0 hover:underline">
          {finding.title}
        </Link>
        {marker ? <Badge tone="focus">{marker === "new" ? "New since last refresh" : "Updated since last refresh"}</Badge> : null}
        <span className="hidden whitespace-nowrap text-[12px] md:inline">
          <CategoryLabel category={finding.category} />
        </span>
        <FindingStatusBadge status={finding.status} />
        {showRun ? (
          <span className="hidden max-w-[180px] truncate text-[12px] text-fg-2 lg:inline">{finding.run_label ?? finding.run_id}</span>
        ) : null}
      </div>
      {expanded ? (
        <div id={detailId} className="border-t border-line bg-surface-0/40 px-3 py-3 pl-9">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-fg-2">
            <ConfidenceBadge confidence={finding.confidence} />
            <Mono className="text-[11px]">{finding.id}</Mono>
            <span>
              run{" "}
              <Link to={`/runs/${encodeURIComponent(finding.run_id)}`} className="text-fg-1 hover:underline">
                {finding.run_label ?? <Mono>{finding.run_id}</Mono>}
              </Link>
            </span>
          </div>
          {children}
          <div className="mt-3 flex flex-wrap gap-3 text-[12px]">
            <Link to={findingHref(finding.id, from)} className="text-focus hover:underline">
              Open investigation →
            </Link>
            <Link
              to={`/runs/${encodeURIComponent(finding.run_id)}?finding_id=${encodeURIComponent(finding.id)}`}
              className="text-fg-1 hover:underline"
            >
              Linked events in run timeline
            </Link>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Outcomes of linked events for one basis. Empty means "no linked event of this basis" - never "nothing happened". */
export function OutcomeLine({ label, outcomes, emptyText }: { label: string; outcomes: readonly Outcome[]; emptyText: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label w-40 shrink-0">{label}</span>
      {outcomes.length === 0 ? (
        <span className="text-[12px] text-unknown">{emptyText}</span>
      ) : (
        outcomes.map((o) => <OutcomeBadge key={o} outcome={o} />)
      )}
      {outcomes.some((o) => o === "denied" || o === "blocked") ? (
        <span className="text-[11px] text-fg-2">denied/blocked = an attempt that was prevented, not a success</span>
      ) : null}
    </div>
  );
}
