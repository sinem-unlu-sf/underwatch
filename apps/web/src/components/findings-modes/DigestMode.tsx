import { DigestDate, isValidTimeZone, type DigestGroup, type DigestResponse, type SnapshotFinding } from "@kw/schema";
import { useMemo, useState, type ReactNode } from "react";
import { useDigest, useRefreshDigest } from "../../api/findingsViews";
import { SeverityBadge } from "../badges";
import { EmptyState, ErrorState, MutationError, SkeletonRows } from "../states";
import { Panel, Time } from "../ui";
import { CompletenessNotice } from "./CompletenessNotice";
import { FixtureNote } from "./CurrentStateMode";
import { FindingRow, useExpanded } from "./FindingRow";
import { SnapshotFindingDetail } from "./SnapshotFindingDetail";
import { browserTimeZone, todayIn, useFindingsMode, useFindingsReturnHref } from "./useFindingsMode";

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Daily Digest: one stored, versioned snapshot per (day, time zone). It changes only when the user presses Refresh
 * (which appends a version only if content changed) or opens another version.
 */
export function DigestMode() {
  const { params, patch } = useFindingsMode();
  const tzParam = params.get("tz");
  const tz = tzParam && isValidTimeZone(tzParam) ? tzParam : browserTimeZone();
  const today = todayIn(tz);
  const dateParam = params.get("date");
  const date = dateParam && DigestDate.safeParse(dateParam).success ? dateParam : today;
  const versionNum = Number(params.get("version"));
  const version = Number.isInteger(versionNum) && versionNum >= 1 ? versionNum : null;
  const groupBy = params.get("group") === "category" ? "category" : "task";

  const digest = useDigest(date, tz, version);
  const refresh = useRefreshDigest(date, tz);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  const goTo = (values: Record<string, string | undefined>) => {
    setRefreshNote(null);
    refresh.reset();
    patch(values);
  };

  const onRefresh = () => {
    setRefreshNote(null);
    refresh.mutate(undefined, {
      onSuccess: (res) => {
        if (version !== null) patch({ version: undefined }, { replace: true });
        setRefreshNote(res.created ? `Created snapshot v${res.snapshot.version}.` : "No changes since this snapshot.");
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" aria-label="Previous day" onClick={() => goTo({ date: shiftDate(date, -1), version: undefined })}>
          ←
        </button>
        <input
          type="date"
          aria-label="Digest date"
          className="field"
          value={date}
          max={today}
          onChange={(e) => {
            if (DigestDate.safeParse(e.target.value).success) goTo({ date: e.target.value, version: undefined });
          }}
        />
        <button
          type="button"
          className="btn"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => goTo({ date: shiftDate(date, 1), version: undefined })}
        >
          →
        </button>
        <span className="text-[12px] text-fg-2" title="Day boundaries are computed in this IANA time zone">
          {tz}
        </span>
        {date !== today ? (
          <button type="button" className="btn" onClick={() => goTo({ date: today, version: undefined })}>
            Today
          </button>
        ) : null}
      </div>

      {digest.isPending ? (
        <Panel bodyClassName="" title="Daily digest">
          <SkeletonRows rows={5} cols={4} />
        </Panel>
      ) : digest.isError ? (
        <Panel title="Daily digest">
          <ErrorState error={digest.error} what="this day's digest" />
        </Panel>
      ) : (
        <DigestBody
          data={digest.data}
          groupBy={groupBy}
          refreshing={refresh.isPending}
          refreshNote={refreshNote}
          refreshError={refresh.error}
          onRefresh={onRefresh}
          onOpenVersion={(v) => goTo({ version: v === null ? undefined : String(v) })}
          onGroupBy={(g) => patch({ group: g === "task" ? undefined : g }, { replace: true })}
        />
      )}
    </div>
  );
}

function DigestBody({
  data,
  groupBy,
  refreshing,
  refreshNote,
  refreshError,
  onRefresh,
  onOpenVersion,
  onGroupBy,
}: {
  data: DigestResponse;
  groupBy: "task" | "category";
  refreshing: boolean;
  refreshNote: string | null;
  refreshError: unknown;
  onRefresh: () => void;
  onOpenVersion: (version: number | null) => void;
  onGroupBy: (g: "task" | "category") => void;
}) {
  const from = useFindingsReturnHref();
  const expanded = useExpanded();
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set());
  const { snapshot, latest_version: latest } = data;
  const content = snapshot.content;
  const byId = useMemo(() => new Map(content.findings.map((f) => [f.id, f])), [content.findings]);
  const groups = groupBy === "task" ? content.groups_by_task : content.groups_by_category;
  const isLatest = snapshot.version === latest;
  const s = content.summary;

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-fg-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-fg-1">
            Snapshot v{snapshot.version} from <Time iso={snapshot.created_at} />
          </span>
          {latest > 1 ? (
            <select
              className="field"
              aria-label="Snapshot version"
              value={snapshot.version}
              onChange={(e) => onOpenVersion(Number(e.target.value) === latest ? null : Number(e.target.value))}
            >
              {Array.from({ length: latest }, (_, i) => latest - i).map((v) => (
                <option key={v} value={v}>
                  v{v}
                  {v === latest ? " (latest)" : ""}
                </option>
              ))}
            </select>
          ) : null}
          {refreshNote ? <span role="status">· {refreshNote}</span> : null}
        </div>
        <button type="button" className="btn" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {refreshError ? <MutationError error={refreshError} what="refresh the digest" /> : null}

      {!isLatest ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[4px] border border-focus/40 px-3 py-2 text-[12px]">
          <span className="text-fg-1">You are viewing an older snapshot. A newer snapshot (v{latest}) exists.</span>
          <button type="button" className="text-focus hover:underline" onClick={() => onOpenVersion(null)}>
            Open newer snapshot
          </button>
        </div>
      ) : data.newer_available ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[4px] border border-focus/40 px-3 py-2 text-[12px]">
          <span className="text-fg-1">
            Newer findings available ({data.changes.new_finding_ids.length} new, {data.changes.updated_finding_ids.length} updated
            {data.changes.removed_finding_ids.length > 0 ? `, ${data.changes.removed_finding_ids.length} removed` : ""}). Checked{" "}
            <Time iso={data.checked_at} />.
          </span>
          <button type="button" className="text-focus hover:underline" onClick={onRefresh} disabled={refreshing}>
            Refresh to open a newer snapshot
          </button>
        </div>
      ) : null}

      <Panel
        title={`${content.scope.date} · ${content.scope.tz}`}
        aside={content.contains_fixture_data ? <FixtureNote /> : null}
        bodyClassName="flex flex-col gap-3 p-3"
      >
        <p aria-label="Digest summary" className="text-fg-1">
          {s.total_findings} finding{s.total_findings === 1 ? "" : "s"} across {s.total_runs} run{s.total_runs === 1 ? "" : "s"} ·{" "}
          <span className={s.needs_attention.length > 0 ? "text-warn" : ""}>{s.needs_attention.length} need attention</span> · {s.blocked.length}{" "}
          blocked · {s.uncertain.length} uncertain · {s.coverage_gaps.length} coverage caveat{s.coverage_gaps.length === 1 ? "" : "s"}
        </p>
        <CompletenessNotice completeness={content.completeness} scope="this day" />
      </Panel>

      <Panel
        bodyClassName=""
        title={`Grouped by ${groupBy}`}
        aside={
          <div role="radiogroup" aria-label="Group digest by" className="inline-flex gap-1">
            {(["task", "category"] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={groupBy === g}
                onClick={() => onGroupBy(g)}
                className={`rounded-[3px] px-2 py-0.5 text-[12px] ${groupBy === g ? "bg-surface-3 text-fg-0" : "text-fg-2 hover:text-fg-0"}`}
              >
                {g === "task" ? "Task" : "Category"}
              </button>
            ))}
          </div>
        }
      >
        {content.findings.length === 0 ? (
          <EmptyState title="No findings in this digest">
            {content.runs.length === 0
              ? "No runs started on this day in this time zone."
              : `${content.runs.length} run${content.runs.length === 1 ? "" : "s"} started on this day without findings. See the caveats above for coverage limits.`}
          </EmptyState>
        ) : (
          <ul>
            {groups.map((g) => (
              <GroupRow
                key={`${g.kind}:${g.key}`}
                group={g}
                open={openGroups.has(g.key)}
                onToggle={() => toggleGroup(g.key)}
                findings={g.finding_ids.map((id) => byId.get(id)).filter((f): f is SnapshotFinding => f !== undefined)}
                renderFinding={(f) => (
                  <FindingRow key={f.id} finding={f} from={from} expanded={expanded.isOpen(f.id)} onToggle={() => expanded.toggle(f.id)}>
                    <SnapshotFindingDetail finding={f} />
                  </FindingRow>
                )}
              />
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function GroupRow({
  group,
  open,
  onToggle,
  findings,
  renderFinding,
}: {
  group: DigestGroup;
  open: boolean;
  onToggle: () => void;
  findings: SnapshotFinding[];
  renderFinding: (f: SnapshotFinding) => ReactNode;
}) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
        <span className="w-4 font-mono text-fg-2">{open ? "▾" : "▸"}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-fg-0">{group.label}</span>
        {group.max_severity ? <SeverityBadge severity={group.max_severity} /> : null}
        <span className="text-[12px] whitespace-nowrap text-fg-2">
          {group.finding_ids.length} finding{group.finding_ids.length === 1 ? "" : "s"} · {group.open_count} open · {group.run_ids.length} run
          {group.run_ids.length === 1 ? "" : "s"}
        </span>
      </button>
      {open ? <ul className="border-t border-line bg-surface-0/30">{findings.map(renderFinding)}</ul> : null}
    </li>
  );
}
