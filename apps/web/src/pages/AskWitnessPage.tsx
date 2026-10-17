import {
  ASK_WITNESS_INVESTIGATOR_QUESTIONS,
  ASK_WITNESS_SUGGESTED_QUESTIONS,
  type BundleEvidenceRef,
  type FindingListItem,
  type InvestigationTurn,
  type RunListItem,
} from "@kw/schema";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ApiRequestError, api, newClientRequestId } from "../api/client";
import { queryKeys, useFindings, useRuns } from "../api/queries";
import { asBundleRef, citationHref, scopedApi, scopeKey, type AskScope, type ScopedEvidenceRef } from "../api/scopedAsk";
import { TurnView, type EvidenceLookup, type FollowUpMode } from "../components/askwitness/AnswerView";
import { SCOPE_SUGGESTIONS } from "../components/askwitness/AskWitnessDrawer";
import { SUGGESTION_MODE } from "../components/askwitness/AskWitnessPanel";
import { EvidenceRefDrawer } from "../components/askwitness/EvidenceRef";
import { FixtureBadge, SeverityBadge } from "../components/badges";
import { Notice, Section, SegmentedControl, StatusPill } from "../components/ds";
import { EmptyState, ErrorState, MutationError, SkeletonBlock } from "../components/states";
import { Mono, PageHeader, Time } from "../components/ui";
import { truncate } from "../lib/format";
import { useUrlFilters } from "../lib/searchParams";

/**
 * Ask Witness workspace (full page). Same server routes, evidence rules and answer rendering as the drawer and the
 * finding panel: the server answers from a small, capped, redacted bundle of Kernel Witness's own records for the chosen
 * scope and validates every citation; this page renders the validated turns with TurnView. Nothing is fetched in the
 * background and nothing opens by itself. Scope, run, finding and investigation live in the URL so a view is linkable.
 */

type ScopeChoice = "workspace" | "run" | "finding";

interface HistoryItem {
  id: string;
  updated_at: string;
  turn_count: number;
  last_question: string | null;
}

interface Pending {
  question: string;
  clientRequestId: string;
  investigationId: string | null;
  mode?: FollowUpMode;
}

interface ConversationSource {
  key: string;
  listKey: QueryKey;
  list: () => Promise<HistoryItem[]>;
  detailKey: (id: string) => QueryKey;
  detail: (id: string) => Promise<{ turns: InvestigationTurn[]; index: ScopedEvidenceRef[]; ai: { available: boolean; detail: string } | null }>;
  ask: (p: Pending) => Promise<{ investigationId: string; index: ScopedEvidenceRef[] }>;
  suggestions: readonly string[];
  investigatorQuestions: readonly string[];
  records: ReactNode;
  inputLabel: string;
  noun: string;
  findingId: string | null;
  /** Other views' cache entries that show the same investigation (finding page panel, evidence graph). */
  alsoInvalidate?: (investigationId: string) => QueryKey[];
}

/** Shared with the drawer so a conversation started here continues there (same tab). */
const DRAWER_STORAGE_KEY = "kw.askwitness.scoped";
function rememberForDrawer(key: string, investigationId: string) {
  try {
    const raw = window.sessionStorage.getItem(DRAWER_STORAGE_KEY);
    const ids = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    window.sessionStorage.setItem(DRAWER_STORAGE_KEY, JSON.stringify({ ...ids, [key]: investigationId }));
  } catch {
    // storage unavailable: the drawer simply starts from its own lookup
  }
}

const ONCE = { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 30_000 } as const;

const fromBundle = (r: BundleEvidenceRef): ScopedEvidenceRef => ({ ...r, finding_id: null, safeguard_id: null });

const modeBody = (m?: FollowUpMode) => ({
  ...(m?.depth && m.depth !== "concise" ? { depth: m.depth } : {}),
  ...(m?.style && m.style !== "standard" ? { style: m.style } : {}),
});

function scopedSource(scope: AskScope): ConversationSource {
  const key = scopeKey(scope);
  return {
    key,
    listKey: ["askPage", "list", key],
    list: () => scopedApi.list(scope),
    detailKey: (id) => ["askPage", "detail", id],
    detail: (id) => scopedApi.detail(id).then((d) => ({ turns: d.turns, index: d.evidence_index, ai: d.ai })),
    ask: (p) =>
      scopedApi
        .ask(scope, {
          question: p.question,
          client_request_id: p.clientRequestId,
          ...(p.investigationId ? { investigation_id: p.investigationId } : {}),
          ...modeBody(p.mode),
        } as Parameters<typeof scopedApi.ask>[1])
        .then((r) => {
          rememberForDrawer(key, r.investigation.id);
          return { investigationId: r.investigation.id, index: r.evidence_index };
        }),
    suggestions: SCOPE_SUGGESTIONS[scope.kind],
    investigatorQuestions: [],
    records:
      scope.kind === "run" ? (
        <>
          this run's events, findings, coverage and policy (<Mono>{scope.runId}</Mono>)
        </>
      ) : (
        "all findings, runs, coverage, safeguards, verification results and today's digest"
      ),
    inputLabel: scope.kind === "run" ? "Ask a question about this run" : "Ask a question about all findings",
    noun: scope.kind === "run" ? "this run" : "all findings",
    findingId: null,
  };
}

function findingSource(findingId: string): ConversationSource {
  return {
    key: `finding:${findingId}`,
    // Page-local keys: the cached value is reshaped, so it must not share the finding panel's cache entries.
    listKey: ["askPage", "list", `finding:${findingId}`],
    list: () => api.findingInvestigations(findingId).then((r) => r.items),
    detailKey: (id) => ["askPage", "detail", id],
    detail: (id) => api.investigation(id).then((d) => ({ turns: d.turns, index: d.evidence_index.map(fromBundle), ai: d.ai })),
    ask: (p) =>
      api
        .askWitness(findingId, {
          question: p.question,
          client_request_id: p.clientRequestId,
          ...(p.investigationId ? { investigation_id: p.investigationId } : {}),
          ...modeBody(p.mode),
        })
        .then((r) => ({ investigationId: r.investigation.id, index: r.evidence_index.map(fromBundle) })),
    alsoInvalidate: (investigationId) => [queryKeys.findingInvestigations(findingId), queryKeys.investigation(investigationId), queryKeys.findingGraph(findingId)],
    suggestions: ASK_WITNESS_SUGGESTED_QUESTIONS,
    investigatorQuestions: ASK_WITNESS_INVESTIGATOR_QUESTIONS,
    records: "this finding's evidence bundle (redacted)",
    inputLabel: "Ask a question about this finding",
    noun: "this finding",
    findingId,
  };
}

export function AskWitnessPage() {
  const { get, set } = useUrlFilters();
  const raw = get("scope");
  const choice: ScopeChoice = raw === "run" || raw === "finding" ? raw : "workspace";
  const runId = get("run") ?? null;
  const findingId = get("finding") ?? null;

  const runs = useRuns({ limit: 100 });
  const findings = useFindings({ limit: 200 });

  const source = useMemo<ConversationSource | null>(() => {
    if (choice === "workspace") return scopedSource({ kind: "workspace" });
    if (choice === "run") return runId ? scopedSource({ kind: "run", runId }) : null;
    return findingId ? findingSource(findingId) : null;
  }, [choice, runId, findingId]);

  const run = runId ? runs.data?.items.find((r) => r.id === runId) : undefined;
  const finding = findingId ? findings.data?.items.find((f) => f.id === findingId) : undefined;

  return (
    <div>
      <PageHeader
        title="Ask Witness"
        subtitle="Questions answered from Kernel Witness's own records. AI interprets the evidence; it does not establish facts. Every citation is checked against the records sent."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="label">Scope</span>
          <SegmentedControl<ScopeChoice>
            label="Ask Witness scope"
            value={choice}
            onChange={(v) => set({ scope: v === "workspace" ? undefined : v, inv: undefined }, { replace: true })}
            options={[
              { value: "workspace", label: "All findings" },
              { value: "run", label: "A run" },
              { value: "finding", label: "A finding" },
            ]}
          />
        </div>
        {choice === "run" ? (
          <ScopePicker
            label="Run"
            value={runId}
            onChange={(v) => set({ run: v, inv: undefined })}
            query={runs}
            placeholder="Choose a run…"
            options={(runs.data?.items ?? []).map((r: RunListItem) => [r.id, `${r.is_fixture ? "[FIXTURE] " : ""}${r.label ? truncate(r.label, 56) : r.id}`])}
          />
        ) : null}
        {choice === "finding" ? (
          <ScopePicker
            label="Finding"
            value={findingId}
            onChange={(v) => set({ finding: v, inv: undefined })}
            query={findings}
            placeholder="Choose a finding…"
            options={(findings.data?.items ?? []).map((f: FindingListItem) => [f.id, `${f.is_fixture ? "[FIXTURE] " : ""}${truncate(f.title, 64)} · ${f.severity}`])}
          />
        ) : null}
      </div>

      {choice === "run" && run ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="label">Investigating</span>
          <FixtureBadge isFixture={run.is_fixture} />
          <Link to={`/runs/${encodeURIComponent(run.id)}`} className="font-medium text-fg-0 hover:underline">
            {run.label ?? run.id}
          </Link>
          <Mono>{run.id}</Mono>
        </div>
      ) : null}
      {choice === "finding" && finding ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="label">Investigating</span>
          <FixtureBadge isFixture={finding.is_fixture} />
          <Link to={`/findings/${encodeURIComponent(finding.id)}`} className="font-medium text-fg-0 hover:underline">
            {finding.title}
          </Link>
          <SeverityBadge severity={finding.severity} />
        </div>
      ) : null}

      {source ? (
        <Conversation key={source.key} source={source} selected={get("inv") ?? null} onSelect={(id) => set({ inv: id }, { replace: true })} />
      ) : (
        <EmptyState title={choice === "run" ? "Choose a run to ask about" : "Choose a finding to ask about"}>
          Answers in this scope use only that {choice === "run" ? "run's" : "finding's"} records.
        </EmptyState>
      )}
    </div>
  );
}

function ScopePicker({
  label,
  value,
  onChange,
  query,
  placeholder,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | undefined) => void;
  query: { isPending: boolean; isError: boolean; error: unknown };
  placeholder: string;
  options: Array<[string, string]>;
}) {
  if (query.isError) return <ErrorState error={query.error} what={`${label.toLowerCase()}s`} />;
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="label">{label}</span>
      <select aria-label={label} className="field max-w-[min(480px,100%)]" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} disabled={query.isPending}>
        <option value="">{query.isPending ? "Loading…" : placeholder}</option>
        {value && !options.some(([v]) => v === value) ? <option value={value}>{value}</option> : null}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Conversation({ source, selected, onSelect }: { source: ConversationSource; selected: string | null; onSelect: (id: string | undefined) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useQuery({ queryKey: source.listKey, queryFn: source.list, ...ONCE });
  const items = useMemo(() => [...(list.data ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [list.data]);
  const latest = items.find((i) => i.turn_count > 0)?.id ?? items[0]?.id ?? null;
  const investigationId = selected === "new" ? null : (selected ?? latest);
  const detail = useQuery({
    queryKey: source.detailKey(investigationId ?? ""),
    queryFn: () => source.detail(investigationId!),
    enabled: investigationId !== null,
    ...ONCE,
  });

  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [extraIndex, setExtraIndex] = useState<ScopedEvidenceRef[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const askedHere = useRef(false);

  const ask = useMutation({
    mutationFn: (p: Pending) => source.ask(p),
    onSuccess: async (res) => {
      setExtraIndex((prev) => [...prev, ...res.index]);
      onSelect(res.investigationId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: source.detailKey(res.investigationId) }),
        qc.invalidateQueries({ queryKey: source.listKey }),
        ...(source.alsoInvalidate?.(res.investigationId) ?? []).map((k) => qc.invalidateQueries({ queryKey: k })),
      ]);
      setPending(null);
    },
  });

  const submit = (question: string, mode?: FollowUpMode) => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    const p: Pending = { question: q, clientRequestId: newClientRequestId(), investigationId, ...(mode ? { mode } : {}) };
    askedHere.current = true;
    setPending(p);
    setInput("");
    ask.mutate(p);
  };

  /** Same request again: reuse the idempotency key unless the server reported a key conflict. */
  const retryPending = () => {
    if (!pending) return;
    const conflict = ask.error instanceof ApiRequestError && ask.error.code === "conflict";
    const p = conflict ? { ...pending, clientRequestId: newClientRequestId() } : pending;
    setPending(p);
    ask.mutate(p);
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const turns = detail.data?.turns ?? [];
  useEffect(() => {
    if (askedHere.current) endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [turns.length, pending]);

  const index = useMemo(() => {
    const m = new Map<string, ScopedEvidenceRef>();
    for (const r of detail.data?.index ?? []) m.set(r.evidence_id, r);
    for (const r of extraIndex) if (!m.has(r.evidence_id)) m.set(r.evidence_id, r);
    return m;
  }, [detail.data, extraIndex]);
  const bundleIndex = useMemo(() => {
    const m = new Map<string, BundleEvidenceRef>();
    for (const [k, v] of index) m.set(k, asBundleRef(v));
    return m;
  }, [index]);
  const ev: EvidenceLookup = {
    index: bundleIndex,
    onOpen: (id) => {
      const ref = index.get(id);
      // Events, findings and evidence records open in the inspector (it links onward); other records have their own page.
      if (ref && (ref.kind === "event" || ref.kind === "finding" || ref.kind === "evidence")) return setOpenId(id);
      const href = citationHref(id, ref);
      if (href) navigate(href);
      else setOpenId(id);
    },
  };
  const createSafeguard = source.findingId
    ? () => navigate(`/findings/${encodeURIComponent(source.findingId!)}?view=full#safeguards`)
    : undefined;

  const ai = detail.data?.ai;
  const showPending = pending !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <Section
        title="Conversation"
        description={<>Answers use only Kernel Witness records for {source.records}. Claim labels are assigned by Kernel Witness from the cited records, not by the model.</>}
        actions={<StatusPill kind="inferred">AI · advisory</StatusPill>}
      >
        <div className="space-y-4" aria-live="polite">
          {ai && !ai.available ? (
            <Notice tone="unknown" title="ai& unavailable">
              {ai.detail} Questions are still recorded, marked unanswered. Everything else in Kernel Witness works without AI.
            </Notice>
          ) : null}
          {list.isPending ? (
            <SkeletonBlock lines={4} />
          ) : list.isError ? (
            <ErrorState error={list.error} what="earlier investigations" />
          ) : investigationId && detail.isPending ? (
            <SkeletonBlock lines={4} />
          ) : investigationId && detail.isError ? (
            <div className="space-y-2">
              <ErrorState error={detail.error} what="this investigation" />
              <button type="button" className="btn" onClick={() => onSelect("new")}>
                Start a new investigation
              </button>
            </div>
          ) : turns.length === 0 && !showPending ? (
            <p className="text-[12.5px] text-fg-2">No questions in this investigation yet. Pick a suggested question or write your own.</p>
          ) : null}

          {turns.map((t) => (
            <TurnView key={t.id} turn={t} ev={ev} onRetry={submit} onFollowUp={submit} retrying={ask.isPending} onCreateSafeguard={createSafeguard} />
          ))}

          {showPending && !turns.some((t) => t.client_request_id === pending.clientRequestId) ? (
            <div className="space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-md border border-line-strong bg-surface-3 px-2 py-1.5 text-[12.5px] whitespace-pre-wrap">{pending.question}</div>
              </div>
              {ask.isPending ? (
                <div role="status" className="rounded-md border border-line bg-surface-1 p-2 text-[12px] text-fg-1">
                  Retrieving Kernel Witness records for {source.noun} and asking ai&… <span className="text-fg-2">(can take up to a minute)</span>
                </div>
              ) : ask.isError ? (
                <div className="space-y-1.5">
                  <AskError error={ask.error} />
                  <div className="flex gap-1.5">
                    <button type="button" className="btn" onClick={retryPending}>
                      Retry
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setInput(pending.question);
                        setPending(null);
                        ask.reset();
                      }}
                    >
                      Edit question
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Suggested questions">
            {source.suggestions.map((q) => (
              <button key={q} type="button" className="btn btn-sm" disabled={ask.isPending} onClick={() => submit(q, SUGGESTION_MODE[q])}>
                {q}
              </button>
            ))}
          </div>
          {source.investigatorQuestions.length > 0 ? (
            <details className="mb-2">
              <summary className="cursor-pointer text-[11.5px] text-fg-2">More investigator questions</summary>
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Investigator questions">
                {source.investigatorQuestions.map((q) => (
                  <button key={q} type="button" className="btn btn-sm" disabled={ask.isPending} onClick={() => submit(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
          <p className="mb-2 text-[11.5px] text-fg-2">Answers are concise by default; use More detail or Explain simply on any answer for more.</p>
          <form onSubmit={onFormSubmit} className="flex gap-1.5">
            <input
              aria-label={source.inputLabel}
              className="field min-w-0 flex-1"
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              placeholder={investigationId ? "Ask a follow-up in this investigation…" : `Ask about ${source.noun}…`}
              disabled={ask.isPending}
            />
            <button type="submit" className="btn btn-primary" disabled={!input.trim() || ask.isPending}>
              {ask.isPending ? "Asking…" : "Ask"}
            </button>
          </form>
        </div>
      </Section>

      <Section level={3} title="Investigations" description="Earlier conversations in this scope.">
        <button type="button" className="btn btn-sm mb-2" aria-pressed={investigationId === null} onClick={() => onSelect("new")} disabled={ask.isPending}>
          New investigation
        </button>
        {list.isPending ? (
          <SkeletonBlock lines={3} />
        ) : list.isError ? (
          <p className="text-[12px] text-fg-2">History unavailable (see the error beside it).</p>
        ) : items.length === 0 ? (
          <p className="text-[12px] text-fg-2">None yet.</p>
        ) : (
          <ul className="space-y-1" aria-label="Investigation history">
            {items.map((it) => {
              const current = it.id === investigationId;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    disabled={ask.isPending}
                    onClick={() => onSelect(it.id)}
                    className={`w-full rounded-md border px-2 py-1.5 text-left text-[12px] transition-colors duration-[120ms] ${
                      current ? "border-accent/50 bg-surface-2 text-fg-0" : "border-transparent text-fg-1 hover:bg-surface-2"
                    }`}
                  >
                    <span className="block truncate">{it.last_question ?? <Mono>{it.id}</Mono>}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-2">
                      <span className="font-mono">
                        {it.turn_count} turn{it.turn_count === 1 ? "" : "s"}
                      </span>
                      {it.updated_at ? <Time iso={it.updated_at} /> : null}
                      {current ? <span className="text-accent">· open</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {openId ? <EvidenceRefDrawer id={openId} evidenceRef={bundleIndex.get(openId)} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

/** HTTP-level failure (the question may not have been recorded). AI failures after acceptance arrive as failed turns. */
function AskError({ error }: { error: unknown }) {
  const e = error instanceof ApiRequestError ? error : null;
  if (e?.kind === "http" && (e.code === "ai_unavailable" || e.status === 503)) {
    return (
      <Notice tone="caution" title="ai& is unavailable">
        {e.message} The records are unchanged; the rest of Kernel Witness works without ai&.
      </Notice>
    );
  }
  if (e?.kind === "http" && (e.code === "timeout" || e.status === 504)) {
    return (
      <Notice tone="caution" title="ai& request timed out">
        Retrying sends the same request id, so the server returns the stored answer if it finished meanwhile.
      </Notice>
    );
  }
  return <MutationError error={error} what="Asking Witness" />;
}
