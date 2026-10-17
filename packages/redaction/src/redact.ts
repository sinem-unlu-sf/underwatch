import {
  DEFAULT_SYNTHETIC_REGISTRY,
  DETECTORS,
  DETECTOR_CONFIDENCE,
  type DetectorConfidence,
  type DetectorContext,
  type DetectorId,
  type Span,
  type SyntheticSecretRegistry,
} from "./detectors";

/** Bump whenever a detector, threshold or placeholder format changes; stored with every redacted view. */
export const REDACTION_RULESET_VERSION = "kw.redaction.rules@1";

export const DEFAULT_ENTROPY_THRESHOLD = 4.2;
export const DEFAULT_HEX_ENTROPY_THRESHOLD = 3.5;
export const DEFAULT_ENTROPY_MIN_LENGTH = 24;

export interface RedactOptions {
  /** Synthetic-secret registry. Defaults to DEFAULT_SYNTHETIC_REGISTRY; pass `extendRegistry()` to add entries. */
  registry?: SyntheticSecretRegistry;
  /** Exact values that must never appear (e.g. the configured ai& key, a run placeholder). Encoded variants are matched too. */
  knownSecrets?: readonly string[];
  /** Bits/char for the generic high-entropy detector (base64/base62 tokens). Lower = more aggressive. */
  entropyThreshold?: number;
  /** Bits/char for pure-hex tokens (max possible is 4.0). */
  hexEntropyThreshold?: number;
  /** Minimum token length for the high-entropy detector. */
  entropyMinLength?: number;
  /** Run only these detectors. */
  detectors?: readonly DetectorId[];
  /** Skip these detectors. */
  disable?: readonly DetectorId[];
  /**
   * Shared numbering state. Pass the same context to several redact() calls (e.g. every item of one evidence bundle)
   * so the same secret value always gets the same placeholder across items.
   */
  context?: RedactionContext;
}

export interface RedactionMatch {
  detector: DetectorId;
  /** Offsets into the ORIGINAL input text (UTF-16 code units). */
  start: number;
  end: number;
  placeholder: string;
}

export interface RedactResult {
  text: string;
  matches: RedactionMatch[];
  status: "clean" | "redacted";
}

/** Numbering state: per detector, distinct secret value -> ordinal. Values never leave this object. */
export class RedactionContext {
  readonly #ordinals = new Map<DetectorId, Map<string, number>>();

  placeholderFor(detector: DetectorId, value: string): string {
    let byValue = this.#ordinals.get(detector);
    if (!byValue) {
      byValue = new Map();
      this.#ordinals.set(detector, byValue);
    }
    let n = byValue.get(value);
    if (n === undefined) {
      n = byValue.size + 1;
      byValue.set(value, n);
    }
    return `[REDACTED:${detector}#${n}]`;
  }

  /** Count of distinct values per detector (no values exposed). */
  counts(): Partial<Record<DetectorId, number>> {
    const out: Partial<Record<DetectorId, number>> = {};
    for (const [d, m] of this.#ordinals) out[d] = m.size;
    return out;
  }

  toJSON(): unknown {
    return { counts: this.counts() };
  }
}

export function createRedactionContext(): RedactionContext {
  return new RedactionContext();
}

export function extendRegistry(extra: Partial<SyntheticSecretRegistry>, base: SyntheticSecretRegistry = DEFAULT_SYNTHETIC_REGISTRY): SyntheticSecretRegistry {
  return {
    names: [...base.names, ...(extra.names ?? [])],
    value_patterns: [...base.value_patterns, ...(extra.value_patterns ?? [])],
    values: [...base.values, ...(extra.values ?? [])],
  };
}

// Zero-width and invisible format characters an agent (or attacker) could use to split a secret.
const INVISIBLE = /[​-‍⁠﻿­]/g;

/** Strip invisible characters, remembering where each kept char came from in the original. */
function stripInvisible(text: string): { text: string; map: number[] } {
  if (!INVISIBLE.test(text)) {
    INVISIBLE.lastIndex = 0;
    return { text, map: [] };
  }
  INVISIBLE.lastIndex = 0;
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (/[​-‍⁠﻿­]/.test(c)) continue;
    out += c;
    map.push(i);
  }
  map.push(text.length);
  return { text: out, map };
}

function detectorContext(opts: RedactOptions): DetectorContext {
  return {
    registry: opts.registry ?? DEFAULT_SYNTHETIC_REGISTRY,
    knownSecrets: opts.knownSecrets ?? [],
    entropyThreshold: opts.entropyThreshold ?? DEFAULT_ENTROPY_THRESHOLD,
    hexEntropyThreshold: opts.hexEntropyThreshold ?? DEFAULT_HEX_ENTROPY_THRESHOLD,
    entropyMinLength: opts.entropyMinLength ?? DEFAULT_ENTROPY_MIN_LENGTH,
  };
}

/** Merge overlapping/adjacent-overlapping spans. The merged span takes the detector of the highest-priority member. */
function mergeSpans(input: Span[]): Span[] {
  // A heuristic span that overlaps a precise span is dropped, so it cannot widen the precise span (e.g. swallow the
  // escaped "\n" before a PEM body).
  const precise = input.filter((s) => DETECTOR_CONFIDENCE[s.detector] !== "heuristic");
  const spans = input.filter((s) => DETECTOR_CONFIDENCE[s.detector] !== "heuristic" ? true : !precise.some((p) => s.start < p.end && p.start < s.end));
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end || b.priority - a.priority);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      if (s.priority > last.priority) {
        last.priority = s.priority;
        last.detector = s.detector;
      }
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

function selectedDetectors(opts: RedactOptions) {
  return DETECTORS.filter((d) => (!opts.detectors || opts.detectors.includes(d.id)) && !(opts.disable ?? []).includes(d.id));
}

/** Find secret spans without rewriting. Offsets refer to the original text. */
export function findSecrets(text: string, opts: RedactOptions = {}): Array<{ detector: DetectorId; start: number; end: number; confidence: DetectorConfidence }> {
  const { text: scan, map } = stripInvisible(text);
  const ctx = detectorContext(opts);
  const spans: Span[] = [];
  for (const d of selectedDetectors(opts)) spans.push(...d.find(scan, ctx));
  const toOrig = (i: number) => (map.length ? map[i]! : i);
  return mergeSpans(spans).map((s) => ({
    detector: s.detector,
    start: toOrig(s.start),
    // map the exclusive end via the last included char so trailing invisible chars outside the secret are kept
    end: s.end > s.start ? toOrig(s.end - 1) + 1 : toOrig(s.end),
    confidence: DETECTOR_CONFIDENCE[s.detector],
  }));
}

/** Pre-existing marker text in the input is escaped so a planted fake marker cannot pass for a real redaction. */
function escapeMarkers(segment: string): string {
  return segment.replace(/\[REDACTED:/g, "[REDACTED\\:");
}

/**
 * Redact secrets from `text`, replacing each secret span with a deterministic placeholder `[REDACTED:<detector>#<n>]`.
 * Everything outside the spans (keys, quotes, punctuation, newlines) is preserved, so line and JSON structure survive.
 * Never throws for string input.
 */
export function redact(text: string, opts: RedactOptions = {}): RedactResult {
  const ctx = opts.context ?? new RedactionContext();
  const found = findSecrets(text, opts);
  const matches: RedactionMatch[] = [];
  let out = "";
  let cursor = 0;
  for (const f of found) {
    const value = text.slice(f.start, f.end).replace(INVISIBLE, "");
    const placeholder = ctx.placeholderFor(f.detector, value);
    out += escapeMarkers(text.slice(cursor, f.start)) + placeholder;
    cursor = f.end;
    matches.push({ detector: f.detector, start: f.start, end: f.end, placeholder });
  }
  out += escapeMarkers(text.slice(cursor));
  return { text: out, matches, status: matches.length > 0 ? "redacted" : "clean" };
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export interface RedactDeepResult<T> {
  value: T;
  matches: Array<RedactionMatch & { path: string }>;
  status: "clean" | "redacted";
}

/**
 * Redact every string leaf of a JSON-like value. Keys are preserved; strings under `skipKeys` (e.g. ID fields) are
 * left untouched only if they also satisfy `isSafeId` (default: KW ID shape), otherwise they are scanned like content.
 */
export function redactDeep<T extends JsonValue>(
  value: T,
  opts: RedactOptions & { skipKeys?: readonly string[]; isSafeId?: (s: string) => boolean } = {},
): RedactDeepResult<T> {
  const ctx = opts.context ?? new RedactionContext();
  const skip = new Set(opts.skipKeys ?? []);
  const isSafeId = opts.isSafeId ?? ((s: string) => /^(run|pol|evt|evd|fnd|fsc|sg|ver|cor)_[A-Za-z0-9_-]+$/.test(s));
  const matches: Array<RedactionMatch & { path: string }> = [];
  const walk = (v: JsonValue, path: string, key: string | null): JsonValue => {
    if (typeof v === "string") {
      if (key !== null && skip.has(key) && isSafeId(v)) return v;
      const r = redact(v, { ...opts, context: ctx });
      for (const m of r.matches) matches.push({ ...m, path });
      return r.text;
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`, key));
    if (v !== null && typeof v === "object") {
      const o: { [k: string]: JsonValue } = {};
      for (const [k, x] of Object.entries(v)) o[k] = walk(x, path ? `${path}.${k}` : k, k);
      return o;
    }
    return v;
  };
  const out = walk(value, "", null) as T;
  return { value: out, matches, status: matches.length ? "redacted" : "clean" };
}

/**
 * Egress check for an exact outbound payload: runs exact + pattern detectors (no entropy heuristic, which would trip on
 * hashes and placeholders). Returns the detectors that fired; never returns the matched values.
 */
export function scanForLeaks(payload: string, opts: Omit<RedactOptions, "detectors" | "context"> = {}): DetectorId[] {
  const hits = findSecrets(payload, { ...opts, disable: [...(opts.disable ?? []), "high_entropy"] });
  return [...new Set(hits.map((h) => h.detector))];
}

/** Map a redaction result onto the schema's Evidence.redaction_status vocabulary. */
export function toEvidenceRedactionStatus(r: { status: "clean" | "redacted" }): "no_secrets_detected" | "redacted" {
  return r.status === "clean" ? "no_secrets_detected" : "redacted";
}
