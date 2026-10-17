import { FINDINGS_VIEW_MODE_LABELS, FINDINGS_VIEW_MODES, type FindingsViewMode } from "@kw/schema";
import { useRef, type KeyboardEvent } from "react";

const MODE_HINT: Record<FindingsViewMode, string> = {
  digest: "One stable summary per day. Changes only when you refresh it or open another version.",
  task: "Findings for one coding task or run, with its events, policy, and evidence.",
  current: "Latest findings as of your last refresh. Never updates on its own.",
};

/** Compact segmented control (ARIA radiogroup with arrow-key support). Presentation only. */
export function ModeSwitcher({ mode, onChange }: { mode: FindingsViewMode; onChange: (mode: FindingsViewMode) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = (index + delta + FINDINGS_VIEW_MODES.length) % FINDINGS_VIEW_MODES.length;
    const m = FINDINGS_VIEW_MODES[next]!;
    onChange(m);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Findings view" className="inline-flex rounded-[4px] border border-line-strong bg-surface-1 p-0.5">
      {FINDINGS_VIEW_MODES.map((m, i) => {
        const selected = m === mode;
        return (
          <button
            key={m}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            title={MODE_HINT[m]}
            onClick={() => onChange(m)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`rounded-[3px] px-2.5 py-1 text-[12px] font-medium ${
              selected ? "bg-fg-0 text-surface-0" : "text-fg-1 hover:bg-surface-2 hover:text-fg-0"
            }`}
          >
            {FINDINGS_VIEW_MODE_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}

export const modeHint = (mode: FindingsViewMode) => MODE_HINT[mode];
