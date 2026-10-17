import { CurrentStateMode } from "../components/findings-modes/CurrentStateMode";
import { DigestMode } from "../components/findings-modes/DigestMode";
import { ModeSwitcher, modeHint } from "../components/findings-modes/ModeSwitcher";
import { TaskMode } from "../components/findings-modes/TaskMode";
import { useFindingsMode } from "../components/findings-modes/useFindingsMode";
import { PageHeader } from "../components/ui";

/**
 * Findings (PRD Addendum B). The mode only changes how persisted findings are organized and when this view retrieves
 * newer data; it never affects event collection, finding generation, or enforcement.
 */
export function FindingsPage() {
  const { mode, setMode } = useFindingsMode();

  return (
    <div>
      <PageHeader
        title="Findings"
        subtitle={<>Discrepancies between what the agent reported, what was observed, and what policy allowed. {modeHint(mode)}</>}
        actions={<ModeSwitcher mode={mode} onChange={setMode} />}
      />
      {mode === "task" ? <TaskMode /> : mode === "digest" ? <DigestMode /> : <CurrentStateMode />}
    </div>
  );
}
