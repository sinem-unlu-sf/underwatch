import {
  FileConflictDetails,
  SAFEGUARD_LIFECYCLE_LABELS,
  type FileDiffPreview,
  type SafeguardDetailResponse,
  type SafeguardMutationResponse,
  type WorkspaceFileChange,
} from "@kw/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ApiRequestError, api } from "../../api/client";
import { invalidateAfterSafeguardChange, queryKeys } from "../../api/queries";
import { humanize } from "../../lib/format";
import { Badge, FixtureBadge, SeverityBadge } from "../badges";
import { EvidenceChip } from "../askwitness/EvidenceRef";
import { MutationError } from "../states";
import { Mono, Time } from "../ui";
import { DiffView, EnforcementExplainer, MechanismBadge, SafeguardStepper } from "./parts";
import { VerificationSection } from "./VerificationSection";

type Mode = { kind: "idle" } | { kind: "edit" } | { kind: "reject" } | { kind: "approve"; preview: FileDiffPreview | null } | { kind: "rollback"; change: WorkspaceFileChange };

function conflictOf(err: unknown): FileConflictDetails | null {
  if (!(err instanceof ApiRequestError) || err.code !== "file_conflict") return null;
  const p = FileConflictDetails.safeParse(err.details);
  return p.success ? p.data : null;
}

function SubSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-1.5 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-fg-1 uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Full review of one safeguard: mechanism + enforcement explainer, rationale, diff, edit / reject / approve with an
 * explicit confirmation stating exactly what will be written where, conflict handling (409 file_conflict shows the
 * regenerated diff and asks for re-approval), copyable patch when no workspace is connected, verification, history.
 */
export function SafeguardReview({ detail, onOpenEvidence }: { detail: SafeguardDetailResponse; onOpenEvidence?: (id: string) => void }) {
  const qc = useQueryClient();
  const sg = detail.safeguard;
  const v = detail.current_version;
  const m = detail.mechanism;
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [draft, setDraft] = useState(v?.content ?? sg.content);
  const [note, setNote] = useState("");
  const [conflict, setConflict] = useState<FileConflictDetails | null>(null);
  const [lastChange, setLastChange] = useState<SafeguardMutationResponse["change"]>(null);
  const [patch, setPatch] = useState<{ text: string; copied: boolean } | null>(null);

  const done = async (next: SafeguardDetailResponse) => {
    qc.setQueryData(queryKeys.safeguard(sg.id), next);
    await invalidateAfterSafeguardChange(qc, sg.id, sg.finding_id);
  };

  const edit = useMutation({
    mutationFn: () => api.editSafeguard(sg.id, { content: draft, note: note.trim() || null }),
    onSuccess: async (res) => {
      setMode({ kind: "idle" });
      setNote("");
      setConflict(null);
      await done(res);
    },
  });
  const reject = useMutation({
    mutationFn: () => api.rejectSafeguard(sg.id, { note: note.trim() }),
    onSuccess: async (res) => {
      setMode({ kind: "idle" });
      setNote("");
      await done(res);
    },
  });
  const approve = useMutation({
    mutationFn: (expected: string | null) =>
      api.approveSafeguard(sg.id, {
        version_id: v!.id,
        workspace_id: detail.workspace?.id ?? null,
        expected_before_sha256: expected,
        confirm: true,
      }),
    onSuccess: async (res) => {
      setMode({ kind: "idle" });
      setConflict(null);
      setLastChange(res.change);
      await done(res.detail);
    },
    onError: async (err) => {
      const c = conflictOf(err);
      if (c) {
        setConflict(c);
        setMode({ kind: "idle" });
        await qc.invalidateQueries({ queryKey: queryKeys.safeguard(sg.id) });
      }
    },
  });
  const rollback = useMutation({
    mutationFn: (changeId: string) => api.rollbackSafeguard(sg.id, { change_id: changeId }),
    onSuccess: async (res) => {
      setMode({ kind: "idle" });
      setLastChange(res.change);
      await done(res.detail);
    },
  });
  const copyPatch = useMutation({
    mutationFn: () => api.safeguardPatch(sg.id, v?.id),
    onSuccess: async (text) => {
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        copied = false;
      }
      setPatch({ text, copied });
    },
  });

  const allowed = detail.allowed_transitions;
  const isFileTarget = v?.target.kind === "workspace_file";
  const preview = detail.diff_preview;
  const workspaceReady = detail.workspace !== null && detail.workspace.status === "active" && preview?.workspace_id != null;
  const unavailable = m.availability.status === "unavailable";
  const canEdit = v !== null && allowed.includes("proposed");
  const canReject = v !== null && allowed.includes("rejected");
  const canApprove = v !== null && allowed.includes("approved") && !unavailable && (!isFileTarget || workspaceReady);
  const busy = edit.isPending || reject.isPending || approve.isPending || rollback.isPending;

  const startApprove = (p: FileDiffPreview | null) => {
    approve.reset();
    setMode({ kind: "approve", preview: p });
  };

  return (
    <div className="space-y-3" data-testid="safeguard-review">
      <div className="flex flex-wrap items-center gap-2">
        <FixtureBadge isFixture={sg.is_fixture} />
        <MechanismBadge kind={m.kind} />
        <span className="text-[14px] font-medium text-fg-0">{sg.title}</span>
        <Badge tone="muted">{SAFEGUARD_LIFECYCLE_LABELS[detail.lifecycle_status]}</Badge>
        {v ? (
          <Badge tone="muted" mono>
            v{v.version} · {v.author === "ai" ? "ai& proposal" : v.author === "template" ? "template proposal (no AI)" : "edited by user"}
          </Badge>
        ) : (
          <Badge tone="unknown">legacy (unversioned)</Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-2">
        <span>Motivating finding</span>
        <FixtureBadge isFixture={detail.finding.is_fixture} compact />
        <Link to={`/findings/${encodeURIComponent(detail.finding.id)}`} className="text-focus hover:underline">
          {detail.finding.title}
        </Link>
        <SeverityBadge severity={detail.finding.severity} />
      </div>

      <SafeguardStepper lifecycle={detail.lifecycle_status} verification={detail.verification_status} />

      <EnforcementExplainer m={m} />

      {v === null ? (
        <div className="hatch rounded-[3px] px-2 py-1.5 text-[12px] text-unknown">
          This safeguard predates versioning (fixture or v1 record). It is shown read-only and cannot be approved or applied here.
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <Labeled label="Rationale">{v?.rationale || sg.intended_effect}</Labeled>
          <Labeled label="Intended effect">{v?.intended_effect ?? sg.intended_effect}</Labeled>
          <Labeled label="Impact on legitimate workflows">{sg.legitimate_workflow_impact || <span className="text-fg-2">Not recorded.</span>}</Labeled>
          {v && v.limitations.length > 0 ? (
            <div>
              <div className="label mb-0.5">Limitations</div>
              <ul className="list-inside list-disc text-[12px] text-fg-1">
                {v.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {v && v.evidence_ids.length > 0 ? (
            <div>
              <div className="label mb-0.5">Evidence cited</div>
              <div className="flex flex-wrap gap-1">
                {v.evidence_ids.map((id) =>
                  onOpenEvidence ? (
                    <EvidenceChip key={id} id={id} evidenceRef={undefined} onOpen={onOpenEvidence} />
                  ) : (
                    <Mono key={id} className="text-[11px]">
                      {id}
                    </Mono>
                  ),
                )}
              </div>
            </div>
          ) : null}
          {v?.author === "ai" ? (
            <div className="text-[11px] text-fg-2">
              Proposed by ai& (<Mono>{v.model ?? "unknown model"}</Mono>, prompt <Mono>{v.prompt_version ?? "?"}</Mono>). A proposal, not a verified control.
            </div>
          ) : null}
        </div>
        <div>
          <div className="label mb-0.5">
            Proposed {m.kind === "instruction" ? "instruction" : m.kind === "permission control" ? "rule" : m.kind === "hook" ? "hook (text only)" : "test scenario"}
          </div>
          <pre className="max-h-64 overflow-auto rounded-[3px] border border-line bg-surface-0 p-2 font-mono text-[12px] whitespace-pre-wrap text-fg-0">
            {v?.content ?? sg.content}
          </pre>
          {v && v.target.kind !== "workspace_file" ? (
            <p className="mt-1 text-[11px] text-fg-2">
              Target: {v.target.kind === "supervised_run_policy" ? "Kernel Witness verification runs and exported config only. In this build it does not change later supervised runs, your repository or your own Claude Code settings" : "stored in Kernel Witness as a verification scenario (nothing written)"}
            </p>
          ) : null}
        </div>
      </div>

      {isFileTarget ? (
        <SubSection title="CLAUDE.md change (before / after)">
          {conflict ? (
            <div role="alert" className="space-y-1.5 rounded-[3px] border border-warn/50 bg-warn/10 p-2">
              <div className="font-medium text-warn">The file changed since you reviewed the diff. Nothing was written.</div>
              <p className="text-[12px] text-fg-1">
                Expected hash <Mono>{conflict.expected_before_sha256?.slice(0, 12) ?? "none (no file)"}</Mono>, found{" "}
                <Mono>{conflict.current_sha256?.slice(0, 12) ?? "none (file missing)"}</Mono>. Review the regenerated diff below and approve again if it is
                still what you want.
              </p>
              <DiffView preview={conflict.diff_preview} workspace={detail.workspace} />
              <button type="button" className="btn btn-primary" onClick={() => startApprove(conflict.diff_preview)} disabled={busy}>
                Review and approve again
              </button>
            </div>
          ) : preview ? (
            <DiffView preview={preview} workspace={detail.workspace} />
          ) : (
            <div className="hatch rounded-[3px] px-2 py-1.5 text-[12px] text-unknown">No diff preview available.</div>
          )}
          {!workspaceReady ? (
            <div className="space-y-1.5 rounded-[3px] border border-line bg-surface-2 p-2 text-[12px]">
              <div className="text-fg-1">
                No authorized workspace is connected to this proposal, so Kernel Witness will not write any file. Copy the patch and apply it yourself, or
                create the demo workspace in{" "}
                <Link to="/settings" className="text-focus hover:underline">
                  Settings
                </Link>{" "}
                and create a new proposal for it.
              </div>
              <button type="button" className="btn" onClick={() => copyPatch.mutate()} disabled={copyPatch.isPending || v === null}>
                {copyPatch.isPending ? "Preparing patch…" : "Copy patch"}
              </button>
              <MutationError error={copyPatch.error} what="Exporting the patch" />
              {patch ? (
                <div className="space-y-1">
                  <div className="text-[11px] text-fg-2">
                    {patch.copied ? "Patch copied to the clipboard. It has not been applied." : "Clipboard unavailable: select and copy the patch below. It has not been applied."}
                  </div>
                  <pre className="max-h-64 overflow-auto rounded-[3px] border border-line bg-surface-0 p-2 font-mono text-[11px] whitespace-pre select-all">{patch.text}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </SubSection>
      ) : null}

      <SubSection title="Review">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-primary" disabled={!canApprove || busy} onClick={() => startApprove(preview)}>
            Approve{isFileTarget ? " and write" : ""}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canEdit || busy}
            onClick={() => {
              setDraft(v?.content ?? "");
              setNote("");
              setMode({ kind: "edit" });
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canReject || busy}
            onClick={() => {
              setNote("");
              setMode({ kind: "reject" });
            }}
          >
            Reject
          </button>
        </div>
        {!canApprove && v !== null && allowed.includes("approved") ? (
          <p className="text-[11px] text-fg-2">
            {unavailable ? "Approval disabled: this mechanism is unavailable in this build." : "Approval disabled: no authorized workspace (use Copy patch)."}
          </p>
        ) : null}

        {mode.kind === "edit" ? (
          <form
            className="space-y-1.5 rounded-[3px] border border-line-strong bg-surface-2 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) edit.mutate();
            }}
          >
            <div className="text-[12px] text-fg-1">Editing creates version {v ? v.version + 1 : "?"}; the original proposal is kept in the history.</div>
            <textarea aria-label="Safeguard content" className="field min-h-[120px] w-full font-mono" value={draft} maxLength={8000} onChange={(e) => setDraft(e.target.value)} />
            <input aria-label="Edit note" className="field w-full" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
            <div className="flex gap-1.5">
              <button type="submit" className="btn btn-primary" disabled={!draft.trim() || edit.isPending}>
                {edit.isPending ? "Saving…" : "Save new version"}
              </button>
              <button type="button" className="btn" onClick={() => setMode({ kind: "idle" })}>
                Cancel
              </button>
            </div>
            <MutationError error={edit.error} what="Saving the edit" />
          </form>
        ) : null}

        {mode.kind === "reject" ? (
          <form
            className="space-y-1.5 rounded-[3px] border border-line-strong bg-surface-2 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (note.trim()) reject.mutate();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="label">
                Reason <span className="text-warn">(required)</span>
              </span>
              <textarea aria-label="Reject reason" className="field min-h-[60px] font-sans" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="flex gap-1.5">
              <button type="submit" className="btn btn-primary" disabled={!note.trim() || reject.isPending}>
                {reject.isPending ? "Rejecting…" : "Reject proposal"}
              </button>
              <button type="button" className="btn" onClick={() => setMode({ kind: "idle" })}>
                Cancel
              </button>
            </div>
            <MutationError error={reject.error} what="Rejecting" />
          </form>
        ) : null}

        {mode.kind === "approve" && v ? (
          <div role="dialog" aria-modal="false" aria-label="Confirm approval" className="space-y-1.5 rounded-[3px] border border-focus bg-surface-2 p-2">
            <div className="font-medium text-fg-0">Confirm approval of version {v.version}</div>
            {isFileTarget && mode.preview && detail.workspace ? (
              <p className="text-[12px] text-fg-1">
                Kernel Witness will write the change shown in the diff to <Mono className="text-fg-0">{`${detail.workspace.root_path}/${mode.preview.rel_path}`}</Mono> in
                workspace <span className="text-fg-0">{detail.workspace.label}</span> ({detail.workspace.kind}). It writes only if the file still has hash{" "}
                <Mono>{mode.preview.before_sha256?.slice(0, 12) ?? "none (file absent)"}</Mono>; otherwise nothing is written and you will see a new diff. The
                previous content is stored for rollback.
              </p>
            ) : v.target.kind === "supervised_run_policy" ? (
              <p className="text-[12px] text-fg-1">
                The rule applies to Kernel Witness verification runs and exported config. In this build it is not merged into later supervised runs.
                Nothing in your repository or your own Claude Code settings changes.
              </p>
            ) : (
              <p className="text-[12px] text-fg-1">The scenario is stored in Kernel Witness and linked to the finding. Nothing is written to any file.</p>
            )}
            <p className="text-[11px] text-fg-2">Approval does not mean the safeguard works. Only a passing verification run shows that, for the tested scenario.</p>
            <div className="flex gap-1.5">
              <button type="button" className="btn btn-primary" disabled={approve.isPending} onClick={() => approve.mutate(isFileTarget ? (mode.preview?.before_sha256 ?? null) : null)}>
                {approve.isPending ? "Applying…" : isFileTarget ? "Confirm: write to file" : "Confirm approval"}
              </button>
              <button type="button" className="btn" onClick={() => setMode({ kind: "idle" })} disabled={approve.isPending}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {!conflictOf(approve.error) ? <MutationError error={approve.error} what="Approval" /> : null}
        {lastChange ? (
          <div role="status" className="text-[12px] text-fg-1">
            {lastChange.status === "applied" ? "Written" : "Rolled back"}: <Mono>{lastChange.rel_path}</Mono> (hash now{" "}
            <Mono>{(lastChange.status === "applied" ? lastChange.after_sha256 : lastChange.before_sha256)?.slice(0, 12) ?? "file removed"}</Mono>).
          </div>
        ) : null}
      </SubSection>

      {detail.file_changes.length > 0 ? (
        <SubSection title="Applied file changes">
          <ul className="space-y-1">
            {detail.file_changes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-1.5 rounded-[3px] border border-line bg-surface-2 px-2 py-1 text-[12px]">
                <Badge tone={c.status === "applied" ? "neutral" : "muted"}>{humanize(c.status)}</Badge>
                <Mono>{c.rel_path}</Mono>
                <span className="text-fg-2">
                  <Mono>{c.before_sha256?.slice(0, 10) ?? "none"}</Mono> → <Mono>{c.after_sha256.slice(0, 10)}</Mono> · <Time iso={c.applied_at} />
                </span>
                {c.status === "applied" && allowed.includes("rolled_back") ? (
                  <button type="button" className="btn ml-auto" disabled={busy} onClick={() => setMode({ kind: "rollback", change: c })}>
                    Roll back
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {mode.kind === "rollback" ? (
            <div role="dialog" aria-label="Confirm rollback" className="space-y-1.5 rounded-[3px] border border-focus bg-surface-2 p-2 text-[12px]">
              <div className="text-fg-1">
                Restore <Mono>{mode.change.rel_path}</Mono> to its content before this change (hash <Mono>{mode.change.before_sha256?.slice(0, 12) ?? "none: file is removed"}</Mono>
                )? If the file was modified since, nothing is written.
              </div>
              <div className="flex gap-1.5">
                <button type="button" className="btn btn-primary" disabled={rollback.isPending} onClick={() => rollback.mutate(mode.change.id)}>
                  {rollback.isPending ? "Rolling back…" : "Confirm rollback"}
                </button>
                <button type="button" className="btn" onClick={() => setMode({ kind: "idle" })}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <MutationError error={rollback.error} what="Rollback" />
        </SubSection>
      ) : null}

      <SubSection title="Verification">
        <VerificationSection detail={detail} />
      </SubSection>

      <SubSection title={`Versions (${detail.versions.length}) and history (${detail.history.length})`}>
        <div className="grid gap-3 lg:grid-cols-2">
          <ol className="space-y-1">
            {detail.versions.map((ver) => (
              <li key={ver.id} className="rounded-[3px] border border-line bg-surface-2 px-2 py-1 text-[12px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={ver.id === v?.id ? "focus" : "muted"} mono>
                    v{ver.version}
                  </Badge>
                  <span className="text-fg-2">{ver.author}</span>
                  <Time iso={ver.created_at} className="text-fg-2" />
                </div>
                <pre className="mt-1 max-h-24 overflow-auto font-mono text-[11px] whitespace-pre-wrap text-fg-1">{ver.content}</pre>
              </li>
            ))}
            {detail.versions.length === 0 ? <li className="text-[12px] text-fg-2">No versions (legacy record).</li> : null}
          </ol>
          <ol className="space-y-1">
            {detail.history.map((h) => (
              <li key={h.id} className="text-[12px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={h.action === "conflict_detected" || h.action === "application_failed" ? "warn" : "muted"}>{humanize(h.action)}</Badge>
                  <span className="text-fg-2">
                    {h.actor_type} <Mono>{h.actor}</Mono>
                  </span>
                  <Time iso={h.at} className="text-fg-2" />
                </div>
                {h.note ? <p className="text-fg-1">{h.note}</p> : null}
              </li>
            ))}
            {detail.history.length === 0 ? <li className="text-[12px] text-fg-2">No history recorded.</li> : null}
          </ol>
        </div>
      </SubSection>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="label mb-0.5">{label}</div>
      <p className="text-[12px] whitespace-pre-wrap text-fg-1">{children}</p>
    </div>
  );
}
