import type { Completeness, CoverageCaveatKind } from "@kw/schema";
import { Mono } from "../ui";

const CAVEAT_LABEL: Record<CoverageCaveatKind, string> = {
  coverage_partial: "Partial observation coverage",
  coverage_unknown: "Coverage unknown",
  collector_errors: "Collector errors",
  run_in_progress: "Run still in progress",
  run_ended_abnormally: "Run ended abnormally",
  day_in_progress: "Day not over yet",
};

/** Never claims completeness: the best case is "no known gaps", stated with its limit. */
export function CompletenessNotice({ completeness, scope }: { completeness: Completeness; scope: string }) {
  if (completeness.status === "no_runs") {
    return (
      <p className="rounded-[4px] border border-dashed border-unknown/60 px-3 py-2 text-[12px] text-unknown">
        No runs were recorded for {scope}. This means no telemetry was ingested, not that nothing happened.
      </p>
    );
  }
  if (completeness.status === "no_known_gaps" || completeness.caveats.length === 0) {
    return <p className="text-[12px] text-fg-2">No known coverage gaps were recorded for {scope}. That is not proof of full coverage.</p>;
  }
  return (
    <div role="note" aria-label="Completeness caveats" className="rounded-[4px] border border-warn/40 bg-warn/8 px-3 py-2 text-[12px]">
      <div className="font-medium text-warn">Not complete: {completeness.caveats.length} caveat{completeness.caveats.length === 1 ? "" : "s"}</div>
      <ul className="mt-1 flex flex-col gap-0.5 text-fg-1">
        {completeness.caveats.map((c, i) => (
          <li key={`${c.kind}-${c.run_id ?? "scope"}-${i}`}>
            <span className="text-fg-0">{CAVEAT_LABEL[c.kind]}</span>
            {c.run_id ? (
              <>
                {" "}
                · <Mono className="text-[11px]">{c.run_id}</Mono>
              </>
            ) : null}
            {c.detail ? <span className="text-fg-2"> · {c.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
