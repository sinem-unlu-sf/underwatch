import { createHash } from "node:crypto";
import { createRedactionContext, REDACTION_RULESET_VERSION, redact, type RedactOptions, type RedactionContext } from "@kw/redaction";
import type { Event, Evidence, Finding, PolicyVersion } from "@kw/schema";

export const BUNDLE_VERSION = "kw.bundle@1";

export interface BundleLimits {
  maxEvents: number;
  maxEvidence: number;
  /** Per untrusted string, after redaction (head + tail kept). */
  maxStringChars: number;
  /** Total characters of untrusted `content` across items; items past the budget keep fields but lose content. */
  maxTotalContentChars: number;
}

export const DEFAULT_BUNDLE_LIMITS: BundleLimits = { maxEvents: 20, maxEvidence: 20, maxStringChars: 2000, maxTotalContentChars: 24000 };

export type BundleFieldValue = string | number | boolean | null | string[];

export interface BundleItem {
  /** The citable id of this item (fnd_/evt_/evd_ id, or "<policy id>#<rule id>"). Never redacted. */
  evidence_id: string;
  kind: "finding" | "event" | "evidence" | "policy_rule";
  basis: "reported" | "observed" | "derived" | null;
  source: string | null;
  timestamp: string | null;
  /** Ids this item points at (e.g. an event's evidence record). Citable only if also present as an item. */
  links: string[];
  /** Deterministic, short, redacted fields. */
  fields: Record<string, BundleFieldValue>;
  /** Untrusted captured text (redacted, sanitized, truncated). Null when absent or dropped by the size budget. */
  content: string | null;
  content_omitted: null | "size_budget" | "not_captured";
  truncated: boolean;
  redaction: { status: "clean" | "redacted"; placeholder_count: number; detectors: string[] };
}

export interface EvidenceBundle {
  bundle_version: typeof BUNDLE_VERSION;
  finding_id: string;
  run_id: string;
  items: BundleItem[];
  /** Ids the model may cite: exactly the `evidence_id` of every item. */
  allowed_ids: string[];
  /** Counts only. `not_provided`: ids the finding references that the caller did not supply. */
  omitted: { events: number; evidence: number; invalid_ids: number; not_provided: number };
  redaction_summary: { ruleset_version: string; items_redacted: number; total_placeholders: number; by_detector: Record<string, number> };
  sanitization: { control_chars_removed: number; invisible_chars_marked: number };
  limits: BundleLimits;
  /** sha256 over the canonical JSON of every other field. */
  sha256: string;
}

export interface BuildBundleInput {
  finding: Finding;
  /** Candidate events; those in finding.related_event_ids are taken first, capped at limits.maxEvents. */
  events?: readonly Event[];
  /** Candidate evidence; ids in finding.evidence_ids, then ids linked from included events, capped at limits.maxEvidence. */
  evidence?: readonly Evidence[];
  policy?: PolicyVersion | null;
  limits?: Partial<BundleLimits>;
  /** Extra redaction options (e.g. knownSecrets: the configured ai& key, run placeholders). */
  redaction?: Omit<RedactOptions, "context">;
}

const ID_RE = /^(run|pol|evt|evd|fnd|fsc|sg|ver|cor)_[A-Za-z0-9_-]{1,120}$/;
const POLICY_RULE_ID_RE = /^[A-Za-z0-9_.-]{1,60}$/;

// ANSI escapes and C0/C1 controls except \n and \t.
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
// bidi controls and zero-width characters are made visible rather than silently kept
const INVISIBLE = /[​-‏‪-‮⁦-⁩⁠﻿]/g;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

class ItemBuilder {
  placeholders = 0;
  detectors = new Set<string>();
  truncated = false;
  constructor(
    private readonly ctx: RedactionContext,
    private readonly opts: Omit<RedactOptions, "context">,
    private readonly limits: BundleLimits,
    private readonly stats: EvidenceBundle["sanitization"],
    private readonly byDetector: Record<string, number>,
  ) {}

  /** Redact, then sanitize, then truncate (truncating after redaction means a cut can never expose part of a secret). */
  text(s: string | null | undefined, maxChars = this.limits.maxStringChars): string | null {
    if (s === null || s === undefined) return null;
    const r = redact(s, { ...this.opts, context: this.ctx });
    this.placeholders += r.matches.length;
    for (const m of r.matches) {
      this.detectors.add(m.detector);
      this.byDetector[m.detector] = (this.byDetector[m.detector] ?? 0) + 1;
    }
    let out = r.text.replace(ANSI, () => {
      this.stats.control_chars_removed++;
      return "";
    });
    out = out.replace(CONTROL, () => {
      this.stats.control_chars_removed++;
      return "";
    });
    out = out.replace(INVISIBLE, (c) => {
      this.stats.invisible_chars_marked++;
      return `<U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}>`;
    });
    out = out.normalize("NFC");
    if (out.length > maxChars) {
      this.truncated = true;
      const head = Math.ceil(maxChars * 0.6);
      const tail = Math.max(0, maxChars - head);
      out = `${out.slice(0, head)}…[truncated ${out.length - head - tail} chars]…${tail > 0 ? out.slice(-tail) : ""}`;
    }
    return out;
  }

  list(xs: readonly string[] | null | undefined, maxItems = 10): string[] {
    return (xs ?? []).slice(0, maxItems).map((x) => this.text(x, 400) ?? "");
  }

  finish(): BundleItem["redaction"] {
    return { status: this.placeholders > 0 ? "redacted" : "clean", placeholder_count: this.placeholders, detectors: [...this.detectors].sort() };
  }
}

/**
 * Build the minimal, redacted evidence subset for one finding. Every untrusted string passes through @kw/redaction
 * with one shared numbering context, so the same secret has the same placeholder across items. Pure: never sends
 * anything anywhere. IDs are validated (never redacted); items with malformed IDs are dropped and counted.
 */
export function buildEvidenceBundle(input: BuildBundleInput): EvidenceBundle {
  const limits = { ...DEFAULT_BUNDLE_LIMITS, ...input.limits };
  const ctx = createRedactionContext();
  const ropts = input.redaction ?? {};
  const sanitization = { control_chars_removed: 0, invisible_chars_marked: 0 };
  const byDetector: Record<string, number> = {};
  const omitted = { events: 0, evidence: 0, invalid_ids: 0, not_provided: 0 };
  const items: BundleItem[] = [];
  const mk = () => new ItemBuilder(ctx, ropts, limits, sanitization, byDetector);
  const f = input.finding;

  // 1. finding (deterministic fields)
  {
    const b = mk();
    const fields: Record<string, BundleFieldValue> = {
      category: f.category,
      title: b.text(f.title, 400),
      description: b.text(f.description, 1500),
      severity: f.severity,
      confidence: f.confidence,
      status: f.status,
      policy_rule_id: f.policy_rule_id,
      missing_information: b.list(f.missing_information),
      recommended_next_step: b.text(f.recommended_next_step, 600),
    };
    items.push({
      evidence_id: f.id,
      kind: "finding",
      basis: "derived",
      source: "kw_analysis",
      timestamp: f.created_at,
      links: [...f.related_event_ids, ...f.evidence_ids],
      fields,
      content: null,
      content_omitted: "not_captured",
      truncated: b.truncated,
      redaction: b.finish(),
    });
  }

  // 2. policy rule(s) referenced by the finding
  if (input.policy && ID_RE.test(input.policy.id)) {
    const rules = input.policy.rules.filter((r) => f.policy_rule_id === null || r.id === f.policy_rule_id);
    for (const rule of rules.slice(0, 5)) {
      if (!POLICY_RULE_ID_RE.test(rule.id)) {
        omitted.invalid_ids++;
        continue;
      }
      const b = mk();
      items.push({
        evidence_id: `${input.policy.id}#${rule.id}`,
        kind: "policy_rule",
        basis: null,
        source: "kw_policy",
        timestamp: null,
        links: [],
        fields: {
          policy_version: b.text(input.policy.version, 100),
          effect: rule.effect,
          action: b.text(rule.action, 100),
          resource_pattern: b.text(rule.resource_pattern, 300),
          description: b.text(rule.description, 800),
        },
        content: null,
        content_omitted: "not_captured",
        truncated: b.truncated,
        redaction: b.finish(),
      });
    }
  }

  // 3. events: the finding's related events, in the finding's order, capped.
  const evById = new Map((input.events ?? []).map((e) => [e.id, e]));
  const chosenEvents = f.related_event_ids.map((id) => evById.get(id)).filter((e): e is Event => e !== undefined);
  omitted.events += Math.max(0, chosenEvents.length - limits.maxEvents);
  const linkedEvidence: string[] = [];
  for (const e of chosenEvents.slice(0, limits.maxEvents)) {
    if (!ID_RE.test(e.id)) {
      omitted.invalid_ids++;
      continue;
    }
    const b = mk();
    if (e.evidence_id) linkedEvidence.push(e.evidence_id);
    items.push({
      evidence_id: e.id,
      kind: "event",
      basis: e.basis,
      source: e.source,
      timestamp: e.timestamp,
      links: e.evidence_id && ID_RE.test(e.evidence_id) ? [e.evidence_id] : [],
      fields: {
        event_type: e.event_type,
        outcome: e.outcome,
        summary: b.text(e.summary, 600),
        tool_name: b.text(e.tool_name, 100),
        target_resource: b.text(e.target_resource, 500),
        process_name: b.text(e.process_name, 100),
        process_id: e.process_id,
        parent_process_id: e.parent_process_id,
        attribution_confidence: e.attribution_confidence,
        collection_status: e.collection_status,
        unavailable_fields: e.unavailable_fields.slice(0, 20),
        limitations: b.list(e.limitations),
      },
      content: b.text(e.raw_summary),
      content_omitted: e.raw_summary ? null : "not_captured",
      truncated: b.truncated,
      redaction: b.finish(),
    });
  }
  omitted.not_provided += f.related_event_ids.length - chosenEvents.length;

  // 4. evidence: finding.evidence_ids first, then evidence linked from included events
  const evdById = new Map((input.evidence ?? []).map((v) => [v.id, v]));
  omitted.not_provided += f.evidence_ids.filter((id) => !evdById.has(id)).length;
  const wanted = [...new Set([...f.evidence_ids, ...linkedEvidence])].filter((id) => evdById.has(id));
  omitted.evidence += Math.max(0, wanted.length - limits.maxEvidence);
  for (const id of wanted.slice(0, limits.maxEvidence)) {
    const v = evdById.get(id)!;
    if (!ID_RE.test(v.id)) {
      omitted.invalid_ids++;
      continue;
    }
    const b = mk();
    const withheld = v.redaction_status === "withheld";
    items.push({
      evidence_id: v.id,
      kind: "evidence",
      basis: null,
      source: v.source_type,
      timestamp: v.timestamp,
      links: [],
      fields: {
        source_type: v.source_type,
        source_reference: b.text(v.source_reference, 300),
        sha256: v.integrity_metadata.sha256,
        upstream_redaction_status: v.redaction_status,
      },
      content: withheld ? null : b.text(v.excerpt),
      content_omitted: withheld || !v.excerpt ? "not_captured" : null,
      truncated: b.truncated,
      redaction: b.finish(),
    });
  }

  // 5. total content budget
  let used = 0;
  for (const it of items) {
    if (it.content === null) continue;
    if (used + it.content.length > limits.maxTotalContentChars) {
      it.content = null;
      it.content_omitted = "size_budget";
      continue;
    }
    used += it.content.length;
  }

  const body: Omit<EvidenceBundle, "sha256"> = {
    bundle_version: BUNDLE_VERSION,
    finding_id: f.id,
    run_id: f.run_id,
    items,
    allowed_ids: items.map((i) => i.evidence_id),
    omitted,
    redaction_summary: {
      ruleset_version: REDACTION_RULESET_VERSION,
      items_redacted: items.filter((i) => i.redaction.status === "redacted").length,
      total_placeholders: items.reduce((n, i) => n + i.redaction.placeholder_count, 0),
      by_detector: byDetector,
    },
    sanitization,
    limits,
  };
  return { ...body, sha256: sha256(canonicalJson(body)) };
}

/** Recompute the hash; false means the bundle was modified after it was built. */
export function verifyBundleHash(bundle: EvidenceBundle): boolean {
  const { sha256: h, ...rest } = bundle;
  return sha256(canonicalJson(rest)) === h;
}
