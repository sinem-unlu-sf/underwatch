import {
  EVIDENCE_SUPPORT_LABELS,
  SAFEGUARD_TYPE_LABELS,
  type AskWitnessAnswer,
  type BundleEvidenceRef,
  type CheckedClaim,
  type EvidenceSupport,
  type InvestigationTurn,
} from "@kw/schema";
import type { ReactNode } from "react";
import { Badge, type Tone } from "../badges";
import { EvidenceChip, InvalidIdChip } from "./EvidenceRef";

/**
 * Renders a validated Ask Witness turn. Claim labels come ONLY from the app-assigned `support` field
 * (EVIDENCE_SUPPORT_LABELS), never from which section the model put a claim in. Nothing here says "verified":
 * the app checks that a citation exists in the bundle and what its basis is; it does not check that the claim text is
 * entailed by the record.
 */

const SUPPORT_TONE: Record<EvidenceSupport, Tone> = {
  observed_evidence: "observed",
  reported_evidence_only: "reported",
  derived_only: "neutral",
  unsupported: "unknown",
};

export function SupportBadge({ support }: { support: EvidenceSupport }) {
  return (
    <Badge tone={SUPPORT_TONE[support]} title="Assigned by Kernel Witness from the cited records in the bundle sent to ai&, not by the model">
      {EVIDENCE_SUPPORT_LABELS[support]}
    </Badge>
  );
}

export interface EvidenceLookup {
  index: ReadonlyMap<string, BundleEvidenceRef>;
  onOpen: (id: string) => void;
}

function ClaimItem({ claim, ev, showSupport = true }: { claim: CheckedClaim; ev: EvidenceLookup; showSupport?: boolean }) {
  return (
    <li className="rounded-[3px] border border-line bg-surface-2 px-2 py-1.5">
      <div className="text-[12.5px] whitespace-pre-wrap text-fg-0">{claim.text}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {showSupport ? <SupportBadge support={claim.support} /> : null}
        {claim.evidence_ids.map((id) => (
          <EvidenceChip key={id} id={id} evidenceRef={ev.index.get(id)} onOpen={ev.onOpen} />
        ))}
        {claim.invalid_evidence_ids.map((id) => (
          <InvalidIdChip key={id} id={id} />
        ))}
      </div>
    </li>
  );
}

function Section({ title, hint, count, children, tone }: { title: string; hint?: ReactNode; count: number; children: ReactNode; tone?: string }) {
  return (
    <section aria-label={title} className="space-y-1">
      <h4 className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase ${tone ?? "text-fg-1"}`}>
        {title} <span className="font-mono text-fg-2">({count})</span>
      </h4>
      {hint ? <p className="text-[11px] text-fg-2">{hint}</p> : null}
      {children}
    </section>
  );
}

function ClaimSection({ title, hint, claims, ev, tone, empty }: { title: string; hint?: ReactNode; claims: CheckedClaim[]; ev: EvidenceLookup; tone?: string; empty?: string }) {
  if (claims.length === 0 && !empty) return null;
  return (
    <Section title={title} hint={hint} count={claims.length} tone={tone}>
      {claims.length === 0 ? (
        <p className="text-[12px] text-fg-2">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {claims.map((c, i) => (
            <ClaimItem key={i} claim={c} ev={ev} />
          ))}
        </ul>
      )}
    </Section>
  );
}

export function AnswerBody({ answer, ev, onCreateSafeguard }: { answer: AskWitnessAnswer; ev: EvidenceLookup; onCreateSafeguard?: () => void }) {
  const observed = answer.verified_facts.filter((f) => f.support === "observed_evidence");
  const reported = answer.verified_facts.filter((f) => f.support === "reported_evidence_only");
  const derived = answer.verified_facts.filter((f) => f.support === "derived_only");
  const check = answer.evidence_check;

  return (
    <div className="space-y-3">
      <p className="text-[13px] whitespace-pre-wrap text-fg-0">{answer.summary}</p>

      {answer.insufficient_evidence ? (
        <div role="status" className="hatch rounded-[3px] px-2 py-1.5 text-[12px] text-unknown">
          Insufficient evidence: the evidence bundle does not support a definitive answer. Treat the summary as tentative.
        </div>
      ) : null}

      {answer.evidence_limitations && answer.evidence_limitations.length > 0 ? (
        <section aria-label="Limits of the evidence sent" className="space-y-1 rounded-[3px] border border-line px-2 py-1.5">
          <h4 className="text-[11px] font-semibold tracking-wide text-unknown uppercase">Limits of the evidence sent (written by Kernel Witness, not the AI)</h4>
          <ul className="list-inside list-disc space-y-0.5 text-[12px] text-fg-1">
            {answer.evidence_limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <ClaimSection
        title="Backed by observed evidence"
        hint="Each cites at least one independently observed record that was in the bundle (checked by Kernel Witness). The record exists; read it to confirm the claim."
        claims={observed}
        ev={ev}
        tone="text-observed"
        empty="No claim cites an independently observed record."
      />
      <ClaimSection
        title="Supported only by agent-reported evidence"
        hint="Cites only the agent's own account (hooks, transcript). Not independently observed."
        claims={reported}
        ev={ev}
        tone="text-reported"
      />
      <ClaimSection title="Supported only by Kernel Witness analysis" hint="Cites only derived records (findings, correlations, policy rules), not raw evidence." claims={derived} ev={ev} />
      <ClaimSection title="Hypotheses" hint="Plausible explanations that are not confirmed." claims={answer.hypotheses} ev={ev} empty="None offered." />

      <Section title="Unknowns" count={answer.unknowns.length}>
        {answer.unknowns.length === 0 ? (
          <p className="text-[12px] text-fg-2">None listed.</p>
        ) : (
          <ul className="space-y-1">
            {answer.unknowns.map((u, i) => (
              <li key={i} className="hatch rounded-[2px] px-2 py-1 text-[12px] text-fg-1">
                {u.text}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {answer.unsupported_claims.length > 0 ? (
        <Section
          title="Unsupported claims (citations invalid - not shown as fact)"
          hint="The model presented these as facts, but none of their citations exist in the evidence bundle."
          count={answer.unsupported_claims.length}
          tone="text-risk"
        >
          <ul className="space-y-1 opacity-80">
            {answer.unsupported_claims.map((c, i) => (
              <ClaimItem key={i} claim={c} ev={ev} />
            ))}
          </ul>
        </Section>
      ) : null}

      {answer.recommended_next_steps.length > 0 ? (
        <Section title="Recommended next steps" count={answer.recommended_next_steps.length}>
          <ul className="list-inside list-disc space-y-0.5 text-[12px] text-fg-1">
            {answer.recommended_next_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {answer.recommended_safeguards.length > 0 ? (
        <Section title="Recommended safeguards (suggestions, not applied)" count={answer.recommended_safeguards.length}>
          <ul className="space-y-1">
            {answer.recommended_safeguards.map((s, i) => (
              <li key={i} className="rounded-[3px] border border-line px-2 py-1 text-[12px]">
                <div className="text-[11px] text-fg-2">{SAFEGUARD_TYPE_LABELS[s.type]}</div>
                <div className="text-fg-1">{s.description}</div>
              </li>
            ))}
          </ul>
          {onCreateSafeguard ? (
            <button type="button" className="btn mt-1" onClick={onCreateSafeguard}>
              Create safeguard
            </button>
          ) : null}
        </Section>
      ) : null}

      <div className="text-[11px] text-fg-2">
        Citation check: {check.cited} cited · {check.valid} in bundle · {check.invalid} not in bundle
        {check.invalid_ids.length > 0 ? (
          <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
            {check.invalid_ids.map((id) => (
              <InvalidIdChip key={id} id={id} />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const ERROR_TITLE: Record<string, string> = {
  not_configured: "ai& is not configured",
  unavailable: "ai& is unavailable",
  rate_limited: "ai& rate limit reached",
  timeout: "ai& request timed out",
  provider_error: "ai& returned an error",
  invalid_output: "ai& returned an invalid answer",
};

/** One recorded turn: the question, then the answer or the recorded failure. */
export function TurnView({
  turn,
  ev,
  onRetry,
  retrying,
  onCreateSafeguard,
}: {
  turn: InvestigationTurn;
  ev: EvidenceLookup;
  onRetry?: (question: string) => void;
  retrying?: boolean;
  onCreateSafeguard?: () => void;
}) {
  const failed = turn.answer === null;
  return (
    <article className="space-y-2" aria-label={`Question: ${turn.question}`}>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[3px] border border-line-strong bg-surface-3 px-2 py-1.5 text-[12.5px] whitespace-pre-wrap">{turn.question}</div>
      </div>
      <div className="rounded-[3px] border border-line bg-surface-1 p-2">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-2">
          <Badge tone="focus" title="Advisory interpretation stored separately from evidence. It is never an event record and never changes a status.">
            AI-generated - interprets evidence, does not establish facts
          </Badge>
          <span className="font-mono">model {turn.model}</span>
          <span className="font-mono">prompt {turn.prompt_version}</span>
          <span className="font-mono">{turn.evidence_ids.length} evidence items sent</span>
        </div>
        {failed ? (
          <div role="alert" className="rounded-[3px] border border-warn/50 bg-warn/10 p-2">
            <div className="font-medium text-warn">{turn.error ? (ERROR_TITLE[turn.error.code] ?? "ai& request failed") : "No answer recorded"}</div>
            <p className="mt-0.5 text-[12px] text-fg-1">
              {turn.error?.message ?? "The request failed."} The evidence is unchanged; the rest of Kernel Witness works without ai&.
            </p>
            {turn.error?.code === "not_configured" ? (
              <p className="mt-0.5 text-[11px] text-fg-2">Set AIAND_API_KEY in .env.local on the server, then restart it.</p>
            ) : null}
            {onRetry ? (
              <button type="button" className="btn mt-1.5" onClick={() => onRetry(turn.question)} disabled={retrying}>
                {retrying ? "Retrying…" : "Retry"}
              </button>
            ) : null}
          </div>
        ) : (
          <AnswerBody answer={turn.answer!} ev={ev} onCreateSafeguard={onCreateSafeguard} />
        )}
      </div>
    </article>
  );
}
