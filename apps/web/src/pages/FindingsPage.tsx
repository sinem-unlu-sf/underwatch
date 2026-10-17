import {
  FINDING_CATEGORY_LABELS,
  FINDING_STATUS_LABELS,
  FindingCategory,
  FindingStatus,
  FixtureFilter,
  Severity,
  type FindingsQueryInput,
} from "@kw/schema";
import { useFindings } from "../api/queries";
import { FindingsTable } from "../components/FindingsTable";
import { Pager } from "../components/Pager";
import { Cmd, EmptyState, ErrorState, SkeletonRows } from "../components/states";
import { Field, Mono, PageHeader, Panel } from "../components/ui";
import { pickEnum, useUrlFilters } from "../lib/searchParams";

const PAGE_SIZE = 50;
const FILTER_KEYS = ["status", "category", "severity", "run_id", "fixture"];

export function FindingsPage() {
  const { get, set, clear } = useUrlFilters();
  const offset = Number(get("offset") ?? 0) || 0;
  const runId = get("run_id");

  const query: FindingsQueryInput = {
    status: pickEnum(get("status"), FindingStatus.options),
    category: pickEnum(get("category"), FindingCategory.options),
    severity: pickEnum(get("severity"), Severity.options),
    run_id: runId && /^run_[A-Za-z0-9_-]+$/.test(runId) ? runId : undefined,
    fixture: pickEnum(get("fixture"), FixtureFilter.options),
    limit: PAGE_SIZE,
    offset,
  };
  const filtered = FILTER_KEYS.some((k) => get(k) !== undefined);
  const findings = useFindings(query);

  return (
    <div>
      <PageHeader title="Findings" subtitle="Discrepancies between what the agent reported, what was observed, and what policy allowed." />

      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-[4px] border border-line bg-surface-1 p-3">
        <Field label="Status">
          <select className="field" value={query.status ?? ""} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any</option>
            {FindingStatus.options.map((s) => (
              <option key={s} value={s}>
                {FINDING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select className="field" value={query.category ?? ""} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Any</option>
            {FindingCategory.options.map((c) => (
              <option key={c} value={c}>
                {FINDING_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Severity">
          <select className="field" value={query.severity ?? ""} onChange={(e) => set({ severity: e.target.value })}>
            <option value="">Any</option>
            {[...Severity.options].reverse().map((s) => (
              <option key={s} value={s}>
                {s}
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
        {query.run_id ? (
          <div className="flex flex-col gap-1">
            <span className="label">Run</span>
            <span className="flex items-center gap-1">
              <Mono>{query.run_id}</Mono>
              <button type="button" className="btn" onClick={() => set({ run_id: undefined })}>
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

      <Panel bodyClassName="" title={findings.data ? `${findings.data.total} finding${findings.data.total === 1 ? "" : "s"}` : "Findings"}>
        {findings.isPending ? (
          <SkeletonRows rows={8} cols={7} />
        ) : findings.isError ? (
          <ErrorState error={findings.error} what="findings" />
        ) : findings.data.items.length === 0 ? (
          filtered ? (
            <EmptyState title="No findings match these filters">
              <button type="button" className="btn mt-2" onClick={() => clear(FILTER_KEYS)}>
                Clear filters
              </button>
            </EmptyState>
          ) : (
            <EmptyState title="No findings recorded">
              Findings are produced by the discrepancy engine from live runs, which is pending architecture review. Fixture findings can be loaded
              with <Cmd>pnpm seed:fixtures</Cmd>.
            </EmptyState>
          )
        ) : (
          <>
            <FindingsTable findings={findings.data.items} />
            <Pager
              offset={offset}
              limit={PAGE_SIZE}
              total={findings.data.total}
              shown={findings.data.items.length}
              onChange={(o) => set({ offset: String(o) })}
            />
          </>
        )}
      </Panel>
    </div>
  );
}
