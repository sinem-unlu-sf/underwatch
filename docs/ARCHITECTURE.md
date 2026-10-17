# Kernel Witness: architecture plan (for review)

**Snapshot:** 2026-10-17, 10:55 JST. **Hard constraint:** the hackathon submission deadline is **16:00 JST today** (VERIFIED: fact-check verdict `ai-and-02` on https://luma.com/b2s69r8p; judging at the table, top-5 live demo at 16:30). That leaves about 5 hours. Everything below is sized for that window. Anything the design drafts specify beyond it is listed as *designed, not built*, and the product must never claim it.

This document answers PRD §14 items 1-7 and Addendum A §11 Phase 1 (`docs/PRD-addendum-ask-witness.md`, added 10:51, which governs where it is more specific; §1.4). It is the review gate the PRD requires before implementation ("Do not begin implementation until the architecture, observation boundary, and integration approach have been reviewed"). It was assembled from four section drafts and a traceability matrix, all written before the addendum existed. Where they contradicted each other, or contradicted evidence that arrived after they were written, the resolution is stated in place and listed in §1.3.

**Path aliases**

| Alias | Path |
|---|---|
| `$REPO` | `/Users/oguzkirmizi/Desktop/academics/hackathons/81agents` (the real repo, foundation build) |
| `$SP` | `/private/tmp/claude-501/-Users-oguzkirmizi-Desktop-academics-hackathons-81agents/e12806d6-35d1-4210-8dab-a807163465a2/scratchpad` (session scratchpad; **ephemeral**, copy evidence into `$REPO/docs/spikes/` in V0) |
| `$KN` | `$SP/kw-next` (staging copy of the monorepo) |
| `spike L<n>` | line `n` of `$SP/research/observation-spike/log.md` |
| `smoke/` | `$SP/agent-smoke/smoke/` (latest in-container agent run, 10:39 JST) |
| `$J` | fact-check journal `~/.claude/projects/-Users-oguzkirmizi-Desktop-academics-hackathons-81agents/e12806d6-…/subagents/workflows/wf_cde4aede-42a/journal.jsonl` |
| `[cc-NN]`, `[ai-NN]`, `[neo-NN]`, `[SPK-NN]` | research fact IDs in `$J`; `V:` prefix = the fact-check verdict for it |

**Evidence tags used throughout**

| Tag | Meaning |
|---|---|
| **EMPIRICAL** | Run on this Mac today. A log line or evidence file is cited. |
| **VERIFIED** | A documentation claim confirmed by a fact-check verdict in `$J`. |
| **DOC** | Stated in primary documentation; not exercised here, and not individually fact-checked (or only partially). |
| **UNVERIFIED** | Not established. Each one names the check that would settle it. |
| **BUILT / STAGING / UNOWNED** | Code state: in `$REPO` with passing tests / in `$KN`, not merged / nobody is building it. |

---

## 1. Status and how to review

**Decided (settled by the user; not re-opened here):** the supervised agent runs headless (`claude -p`) in a disposable Docker container on this Mac; monitoring and authoritative evidence live outside that container, on the host; Neo4j runs locally in Docker; one TypeScript pnpm monorepo; agent auth is a `claude setup-token` OAuth token read from `~/.kernel-witness/claude-oauth-token` and passed only into the agent container. **Built:** the Phase-1 foundation in `$REPO` (shared Zod schema, Fastify + `node:sqlite` API on 127.0.0.1:4600, Vite/React UI on 4601 with all five nav pages, 5 labelled fixture runs; 12 + 22 + 13 tests pass per the build journal). Also built, in staging: the agent image `kw-agent:2.1.302` and the egress proxy. In staging, partly written: `@kw/analysis`, `@kw/graph`, `@kw/redaction`, `@kw/inference`, `@kw/adapter-claude-code`. **Empirically proven on this Mac:**
- Tetragon v1.7.0 observes process trees, policy-selected file opens and connects inside the Docker Desktop VM. It can deny a file open for one container. The agent can neither see nor kill it.
- The internal network plus allowlisting proxy leaves the agent no other route out.
- An authenticated Claude Code run inside the container completed at 10:39, with managed hooks firing on tool calls.

**Needs your sign-off:** the 23 decisions in §8. Each has a recommended default. The four that gate the 11:15 contract freeze are D1-D4: deadline and scope, git, privileged Tetragon, and the agent model. **Not built and unowned:** the run supervisor, the Tetragon observer integration, the workspace snapshotter, the evidence store, the safeguard workflow and the verifier. Together these produce all of the product's independent evidence and demo steps 4 and 8-10. They are the critical path (§6).

### 1.1 What changed after the section drafts were written

| Change | Effect on this plan |
|---|---|
| **The authenticated smoke rerun passed at 10:39** (`smoke/run.json`: `ok: true`, `auth_run: true`, `agent_exit: 0`). The agent ran `Bash(ls -la /workspace)` and `Read(/workspace/README.md)`. `PreToolUse`/`PostToolUse` hook records carry `tool_use_id`; `PostToolBatch`, `Stop` and `SessionEnd` were spooled. `system/init.model` = `claude-haiku-5-5`, `permissionMode` = `default`; cost USD 0.0017; only `api.anthropic.com` was contacted. | The "401 Invalid bearer token" blocker in all four drafts is **retired**. Probe P1 is half done: tool-call hooks work in the container, but no secret-read or edit has run yet. The question about the token file's format is withdrawn. |
| **Conformance checks C1-C4 passed in the same run:** managed hooks fired despite a repo `disableAllHooks`; repo and local hook markers were absent; a repo bypass mode was not applied. | Probe P7 (managed-settings tamper resistance for hooks) is now **EMPIRICAL** for hooks. Not yet for `allowManagedPermissionRulesOnly`, which no deny probe has exercised (`permission_denials: 0`). |
| **The smoke checker bug is fixed:** all three proxy and direct-connection denials now report `pass: true`. | Remove the "checker wrongly marks denials as failures" caveat. |
| **The Claude Code, Neo4j and observation-spike fact-checks landed** (`$J` lines 17-19). No load-bearing fact was refuted, but there are important corrections and omissions (§1.2). | Tags upgraded from "fact-check pending" to VERIFIED where confirmed. Corrections applied below. |
| The ai& fact-check (34 confirmed, 3 partially confirmed, 1 refuted) was already in. The **observation-landscape** fact-check is still running. | Claims sourced only from the landscape research (for example the `io_uring` default-seccomp claim) stay UNVERIFIED. |
| The ui-ux critique (verdict *sound-with-fixes*) landed. The correlation-engine and domain-schema critiques have not. | The ui-ux fixes are not yet folded in. The UI section of the build plan should read that critique before V3/V4 UI work. |
| The ai& key is present in `$REPO/.env.local` (not read). The probe has **not** been run. | ai& stays UNVERIFIED for this account until the probe runs (§4.2.9). |
| **PRD Addendum A** (Ask Witness + Safeguard Generation) was added at 10:51, and `PRD.md` now points to it. The `docs/ASK-WITNESS.md` it references does not exist yet. | The one-shot "explain" becomes a multi-turn, persisted investigation. AI-drafted, diffed `CLAUDE.md` proposals become required. A workspace-authorization concept is added. See §1.4. |

### 1.2 Fact-check corrections that change the design

1. **Sigkill is not blocking** (V:`observation-spike-21`, `-26`). A Tetragon Sigkill on `security_file_permission` or `tcp_connect` means "process terminated; the operation may have completed". Only the LSM `file_open` Override is a true pre-operation denial. The category table (§3.4) and safeguard design reflect this.
2. **Pid-namespace scoping breaks if the agent creates a child pid namespace** (V:`observation-spike-24`). Tetragon has no container selector outside Kubernetes. The agent must therefore be held until the policy is loaded, and must be unable to create pid namespaces. Default seccomp plus `cap_drop: ALL` already prevents that: bwrap's `--unshare-pid` failed (spike L1599-1639). A per-run self-test asserts it (P10).
3. **Overlay duplicates cannot be removed by an ID that includes the timestamp.** The two events are 25-45 µs apart. Idempotent re-ingest uses the raw export position; semantic de-duplication is a separate, labelled inference (§5.6).
4. **Git snapshots must not run over the agent-written `.git`** (spike fact-check, integrity critique B2). The change record is a pure `lstat` + sha256 walk (§5.5).
5. **Docker Desktop 4.57.0 is old** (January 2026). The current release is 4.95.0 with kernel 7.0.14, and 4.57.0 can no longer be downloaded. Every kernel-dependent result holds only for this exact install. Auto-update must stay off for the hackathon (decision D7). If Enhanced Container Isolation is enforced, the sidecar design fails (DOC).
6. **Tetragon loss and durability were never measured.** Metrics are disabled, and export rotation (10 MB × 5) silently deletes evidence. Coverage needs the loss counters and a host-side export (§3.8, P4).
7. **Claude Code mods** (v2.1.287+, on by default) are an extension surface the research missed. Managed settings activate the built-in `cc-plugin-sec-default` guard. That guard appeared in the 10:39 run's `system/init.plugins`, alongside `cc-plugin-agents-md` and `cc-plugin-plugin-authoring` (EMPIRICAL). Add `allowManagedModsOnly` (DOC) and record loaded plugins and mods per run.
8. **Repo-supplied config under `-p`** (the `env` block, `apiKeyHelper`, `.mcp.json`, skill `allowed-tools`) is not covered by `allowManagedHooksOnly` (DOC, fact-check omission). Scenario repos are KW-authored, so this is a product risk, not a demo risk. It is disclosed (R13) and probed (P9).
9. **No Claude Code channel provides process attribution, subprocess file access or network outcomes** (claude-code fact-check). Those must come from Tetragon, the proxy and snapshots, or be shown as unavailable.
10. **The tool-call → process link is `inferred`, not `derived`** (neo4j and claude-code fact-checks). Claude Code reports no child PIDs, so the join is by time window plus ancestry. The graph and demo narration say "inferred".
11. **Claude Code's background traffic** (feature flags and telemetry to `api.anthropic.com`, auto-update to `downloads.claude.ai`, changelog to `raw.githubusercontent.com`, Datadog intake) would create false "unreported network action" findings. Set `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` and `DISABLE_AUTOUPDATER=1` (DOC), and classify the remainder as harness traffic.
12. **The static validation of the drafted Neo4j queries is syntax-only** (V:`neo4j-46`). Three statements are Enterprise-only, and function and property names were not checked. Only a run against the real container validates a query.
13. **Neo4j CE** runs at read-committed isolation and has no audit log. Every CE user is an admin. History guarantees therefore come from SQLite plus the hash-chained evidence manifest, with Neo4j as a rebuildable projection (already the plan).

### 1.3 Contradictions between the section drafts, and how they were resolved

| # | Contradiction | Resolution | Why |
|---|---|---|---|
| X1 | **Neo4j version.** Integrations: switch to 2026.09.0 + `CYPHER 25`. Architecture and build plan: keep 5.26.32, no `CYPHER 25`. | **Keep `neo4j:5.26.32-community`** (running, healthy, staging `@kw/graph` targets it), pinned by digest. Write Cypher-5 queries (variable-length `[:SPAWNED*0..32]`, `EXISTS {}` subqueries). Revisit only if a needed feature is Cypher-25-only. | Prefer what is built. 2026.09's advantage (pre-linted statements) was downgraded by V:`neo4j-46`: the lint was syntax-only. 5.26 is the LTS, supported to Nov 2028 (VERIFIED). |
| X2 | **Agent auth.** All drafts: 401, token needs regenerating. | **Auth works** (10:39 run). Open questions about token format withdrawn; account-type and residual-risk questions kept (D9). | Newer empirical evidence. |
| X3 | **Change record.** Observation and build plan: git temp-index `write-tree` on the volume. Architecture: never run git over the agent's `.git`; use an `lstat` + sha256 walk. | **sha256 walk in a `--network none`, read-only container.** Git only for display, with a KW-owned `GIT_DIR` and hardened config. | Spike fact-check confirms the code-execution risk (`core.fsmonitor`, filters). |
| X4 | **Integrity.** Architecture: hash-chained manifest + seal (signature dropped). Build plan: "hash-chain seal" listed as a depth item that waits. | **Build the chained manifest + `verifyRun` (about 1 agent-hour, runner stream).** Cut fallback: the flat `MANIFEST.sha256` the smoke script already writes, with the badge reading "hashes match capture". Signature dropped in both cases. | PRD §9 requires integrity designed and tested separately (SEC14). The chain is cheap; a signature adds nothing against the stated attackers. |
| X5 | **AI table name.** Architecture: `ai_explanations`. Build plan: `ai_calls`. | **One table `ai_calls`**: one row per attempt, including failures, holding both sets of columns (§5.7 S5). | FR-7 needs model, prompt version and failures recorded; one table is simpler. |
| X6 | **Migration 002 contents differ** (architecture S1-S6 vs build plan `ai_calls`, `safeguard_audit`, `profile_versions`, triggers). | **Unified list in §5.7.** `safeguard_audit` is folded into `audit_events`. `profile_versions` is dropped: an applied safeguard creates a new immutable `policy_versions` row. | Fewer tables; `policy_versions` already exists and is pinned per run. |
| X7 | **Tetragon event identity.** Architecture: `{exec_id}:{function}:{path}:{ktime}`. Spike fact-check: that key cannot dedupe overlay pairs. | **Native key = export source + line offset.** Overlay pairs are kept as two records and grouped by a labelled `corroboration` step. | V:`observation-spike` omission. |
| X8 | **Tetragon transport.** Build plan: `tetra getevents -o json` streamed to host. Observation: open probe P4. | **Default `getevents` streamed to a host file, with metrics enabled for loss counters**; P4 confirms. If export-file mode is used, raise rotation limits and copy segments out continuously. | Durability omission in the spike fact-check. |
| X9 | **`tcp_connect` Sigkill listed as a block** (observation §2.5). | **Removed as a block.** Network blocking = no route (`internal: true`) plus proxy 403. Sigkill on connect is not used. | V:`observation-spike-26`. |
| X10 | **Instruction safeguard placement.** Build plan SG-A appends to the workspace `CLAUDE.md`. Architecture: managed `/etc/claude-code/CLAUDE.md` only. Addendum A §4.5 (newer, governs): a diff to the project- or directory-level `CLAUDE.md` in an **authorized workspace**. | **A diffed edit to the project `CLAUDE.md` of a registered authorized workspace**: a KW scenario template repo on the host, such as `fixtures/repos/invoice-kit`. That template is never mounted into an agent; each run gets a fresh copy. The per-run copy's instruction files (`CLAUDE.md`, `AGENTS.md`, `.claude/rules/*`, subdirectory `CLAUDE.md`) are hashed before and after the run, and `InstructionsLoaded` confirms the file loaded. Managed `/etc/claude-code/CLAUDE.md` (DOC [cc-46]) stays an alternative scope. | Satisfies the addendum (diff, preservation, rollback, authorized target) while keeping agent edits out of the source of truth: the agent only ever writes its disposable copy. |
| X11 | **`--include-hook-events`, `--permission-mode dontAsk`.** Build plan: UNVERIFIED that they exist. Integrations: present in 2.1.302 help. | Both flags appear in the captured `claude --help` of 2.1.302 (`$SP/research/claude-code/evidence/claude-help.txt` l.117, 154, 223): **EMPIRICAL (help text)**. Their behaviour in the container is UNVERIFIED until the V0 scenario smoke. | Local evidence beats an assumption. |
| X12 | **Supervisor ingest model.** Architecture: `docker logs` capture, analysis after close, "live UI may show events". Build plan: batch post-run import via `LiveRunBundle`, no live timeline. | **Batch post-run import** (build plan D1). Raw bytes are still captured to the host during the run. | Saves about 10 agent-hours; both drafts already agree that analysis runs only after close. |
| X13 | **Strace fallback.** Observation lists F (strace sidecar) as the fallback layer. Build plan: drop the fallback ladder. | **Not built for the demo.** If Tetragon is unhealthy, the run proceeds with `kernel_tracer` inactive and coverage `partial`, or is refused for scenarios that require the observer (decision D5). | Time. The spike already proved the fallback's viability if it is ever needed. |
| X14 | **"Resolved" guard.** Architecture: verification run **or** cited later-run evidence. Build plan: only after `verified_for_tested_scenario`. | **Default: require a passing verification run.** A developer override with cited later-run evidence is allowed, audited, and needs a note (decision D15). | PRD FR-6 reading, plus flexibility. |
| X15 | **Overhead numbers** (spike: about 1.0x / 1.8x / 2.9x) were used as a budget hint. | **Context only.** The comparison is confounded (different policies, shared daemon; V:`observation-spike-28`). Product overhead is measured in V6, N=1, labelled. | Fact-check. |
| X16 | **Event-loss handling.** Observation R5: "ring buffer not measured". Architecture: a "drop counts known" rule for `complete`. | **`complete` is impossible until the loss counters are captured** (P4). Until then, `kernel_tracer` coverage carries "loss not measured" in `errors`. | Consistent with the honesty rule. |
| X17 | **AI-drafted safeguards.** The build plan's cut list put "AI-drafted safeguards (templates only)" second. PRD §7.4 ("propose a safeguard from a verified incident") and Addendum A §4.4 ("ai& proposes a safeguard tailored to the finding") require them. | **AI drafting of the `CLAUDE.md` proposal is not cut-able.** Templates remain the fallback when ai& is unavailable, labelled "template (AI unavailable)". AI drafting of permission rules is validated non-broadening. AI drafting of hooks and tests is cut-able. | PRD + addendum govern. |
| X18 | **Explanation vs investigation.** All drafts: one-shot `explainFinding` with schema `kw.explanation.v1`. Addendum §3: multi-turn Ask Witness with fields `summary, verified_facts, hypotheses, unknowns, evidence_references, recommended_next_steps, recommended_safeguards`. | **Replace `explainFinding` with `investigate(question, bundle, history)` using the addendum's schema** (`kw.investigation.v1`). The "explain" button becomes the first suggested question. A claim is shown as *verified* only if the application's grounding check passes (§4.2.6), whatever field the model put it in. | Addendum governs; the grounding design already existed. |

### 1.4 PRD Addendum A (Ask Witness + Safeguard Generation): impact on this plan

The addendum extends FR-7, FR-9 and FR-10. It asks to "extend the current implementation instead of rebuilding it", which this plan does. Requirement → plan change:

| Addendum requirement | Plan change | Where |
|---|---|---|
| Ask Witness panel on Finding Detail: suggested question chips, free input, conversation history, loading and error states, clickable evidence references, path to "Create safeguard" (§3.2, §3.7, §9) | Web B stream builds the panel in place of a single AI panel. Suggested questions are the addendum's eight. | §6.4 V4 |
| Backend-controlled retrieval via Neo4j traversal + evidence store; smallest bundle; no model-chosen Cypher (§3.3-3.4) | Bundle builder calls the named graph queries Q1-Q6 for the finding's neighbourhood. It falls back to SQL when Neo4j is down (AI stays optional). Bundle limits as in §4.2.5. Every item carries ID, source, basis, timestamp, type, target, outcome, policy, limitations, record reference. | §4.2.10 |
| Validated structured response; every evidence ID checked against the supplied bundle; `verified_facts` not trusted by field name (§3.5) | `kw.investigation.v1` schema + citation and grounding validator; unsupported references removed and flagged | §4.2.6, §4.2.10 |
| Follow-ups stay within the finding's context; AI responses stored separately from observations (§3.6) | `investigations` + `investigation_turns` tables; history passed redacted; no cross-run expansion unless the question is "similar findings in other runs" and the user's view already allows it | §5.7 S8 |
| Safeguard types in priority order: `CLAUDE.md` update → permission rule or hook → regression test; unsupported types marked proposed or unavailable (§4.3) | SG-A becomes AI-drafted (template fallback). SG-B permission rule. Hooks shown "unavailable in v1". SG-C environment restriction kept as a KW-specific type (D13). Regression test = scenario re-run (verification), not a generated test file. | §4.1.7, §5.8 |
| `CLAUDE.md` behaviour: inspect the existing file; minimal diff preserving content; no duplicates; exact diff before approval; authorized workspace only; backup and rollback; detect a change between proposal and approval and require re-review; record before/after hashes; never write to an ambiguous path; copyable patch when no workspace is authorized (§4.5) | Registered-workspace allowlist (scenario templates under `$REPO/fixtures/repos/`); proposal binds `base_sha256` of the target file + `content_sha256` of the patch; apply re-checks `base_sha256` (409 → regenerate the diff); before-content blob kept in the evidence store; revert = re-apply the before-blob; patch export always available | §5.8 |
| Instruction vs enforcement distinction in the UI (§4.6) | Strength badges GUIDANCE / AGENT-ENFORCED / ENVIRONMENT-ENFORCED / TEST, plus "can / cannot enforce" text | §4.1.7 |
| Verification: test plan defined before running; blocked case + legit case; statuses `Not tested / Passed / Failed / Inconclusive`; `Passed` only from the harness (§5) | The plan is stored on the verification run before start. UI labels map onto the BUILT enum: `test_pending` → "Not tested", `verified_for_tested_scenario` → "Passed (tested scenario)", `failed_verification` → "Failed", `verification_inconclusive` → "Inconclusive" | §5.8 |
| Regression handling: show both results; never auto-weaken; revision → new review + new verification (§5.4) | An edit creates a new safeguard revision (`revision_of`); the original proposal is never overwritten | §5.7 S4, §5.8 |
| Neo4j: `Investigation` node; `INVESTIGATES`, `USES_EVIDENCE`, `ADDRESSES`, `TESTS` (§6) | Add `Investigation` + `INVESTIGATES` + `USES_EVIDENCE`. Keep the PRD's `PROPOSED_AS`/`VERIFIED_BY`, and also project `ADDRESSES` and `TESTS` as their inverses (cheap; D25) | §4.3.4 |
| Enforce authentication and authorization; workspace authorization (§7, §8) | The foundation has **no user authentication** (single-user, loopback). Plan: per-boot `X-KW-Token` on all mutations + workspace allowlist + idempotency keys (D24) | §5.11 |
| Repeated requests don't create duplicates (AC 23) | `Idempotency-Key` header on POSTs that create records | §5.11 |
| Tests for invalid AI output, nonexistent references, prompt injection, API failures, file conflicts, authorization failures, verification failures (AC 24) | Added to V4/V5 acceptance | §6.4 |
| Document synthetic / mock / real per component (AC 25) | README "real / recorded / fixture / mock" table (V7) | §6.4 |
| Demo §12: synthetic denied `.env` read → "were credentials accessed?" → "denied, but other routes not established" → `CLAUDE.md` + stronger rule → approve in a disposable test project → controlled test | Folded into demo step 7 on the blocked arm (fixture fx-03, or the live `scn.direct` +SG-B run); with Tetragon coverage the answer can add "no open observed on watched paths", still not "not accessed" | §6.9 |

Added cost: about 4 agent-hours (Ask Witness backend 1.5, panel 1.5, `CLAUDE.md` diff/apply/rollback 1). That brings the total to about 40 agent-hours, absorbed by the V3/V4/V5 float and by cutting hook and test drafting.

---

## 2. Repository and environment inventory, and PRD comparison (PRD §14 items 1-3, 7)

### 2.1 Environment

| Item | Value | Status |
|---|---|---|
| Host | macOS 26.5.1, Apple Silicon, SIP on, no root tools used | given |
| Docker | Docker Desktop **4.57.0**, Engine **29.1.3**, VM kernel **6.12.54-linuxkit aarch64**, cgroup v2, BTF present, LSMs `capability,bpf`, no Yama, no Landlock, no `CONFIG_SECURITY_PATH` | EMPIRICAL (spike L53-66, L118, L127, L153, L168, L181; `docker version` 10:50) |
| Node / pnpm | Node 25 on the host (EOL 2026-06-01; works, `node:sqlite` prints ExperimentalWarning); pnpm 9. Containers use `node:24-bookworm` / `node:22-bookworm` images | VERIFIED Node schedule [neo-32]; recommend Node 24 LTS when convenient |
| Java | none; not needed (the Neo4j image bundles its JRE) | VERIFIED [neo-11] |
| Claude Code | 2.1.302 on the host and in `kw-agent:2.1.302` | EMPIRICAL (smoke `claude_version`) |
| Running containers | `kw-neo4j` (`neo4j:5.26.32-community`, healthy, `127.0.0.1:7697->7687`, `127.0.0.1:7484->7474`) | EMPIRICAL (`docker ps` 10:50) |
| Images present | `kw-agent:2.1.302`, `kw-egress-proxy:1`, `quay.io/cilium/tetragon:v1.7.0`, `neo4j:community` (= 2026.09.0), `neo4j:5-community`, `node:24/22-bookworm`, spike images `kw-spike-proxy:1`, `kw-spike-tools:1` | EMPIRICAL |
| Secrets on disk (contents never read) | `~/.kernel-witness/claude-oauth-token` (0600; works per the 10:39 run); `$REPO/.env.local` (0600; ai& key, not exercised); `$KN/.env.neo4j*` (Neo4j password; must move to `~/.kernel-witness/`) | EMPIRICAL (`ls`) |
| Version control | `$REPO` is **not a git repository** | EMPIRICAL; decision D2 |
| Shared daemon | Another agent session used the same Docker daemon during the spike (`kw-spike-cc`; most likely a sibling agent, V:`observation-spike-40`) | Affects VM-wide Tetragon policies (R2) |

### 2.2 Repository inventory (PRD §14 items 1-2)

| Component | Where | State | Notes |
|---|---|---|---|
| `@kw/schema` | `$REPO/packages/schema` (byte-identical copy in `$KN`) | **BUILT** (12 tests) | Zod entities, enums, stable IDs (`ids.ts`), fixture format, `API_CONTRACT`, finding transitions, `integrations.ts` interfaces (`AgentAdapter`, `InferenceProvider`, …) with deliberately no stubs |
| `@kw/server` | `$REPO/apps/server` | **BUILT** (22 tests) | Fastify 5 on 127.0.0.1:4600; `node:sqlite` at `data/kw.db`; plain-SQL migration `001_initial.sql`; 12 routes; idempotent fixture import (`ingest/persist.ts`); append-only `finding_status_history` |
| `@kw/web` | `$REPO/apps/web` | **BUILT** (13 tests; serving 4601) | Vite, React 19, React Router 7, TanStack Query, Tailwind 4; Overview, Agent Runs, Run Detail, Finding Detail, Safeguards, Settings; imports only `@kw/schema` |
| Fixtures | `$REPO/fixtures/runs/fx-01..05` | **BUILT** | 136 events, 6 findings, 1 safeguard; hand-authored, `is_fixture: true` |
| `@kw/analysis` | `$KN/packages/analysis` | **STAGING** | policy, coverage, attribution, reported/observations, rubric, `rules.ts`, `engine.ts`; imports only `@kw/schema` + `zod` |
| `@kw/graph` | `$KN/packages/graph` | **STAGING** | client, model, projection, projector, queries, live test; targets 5.26 |
| `@kw/redaction` | `$KN/packages/redaction` | **STAGING** | detectors, `redact`, tests |
| `@kw/inference` | `$KN/packages/inference` | **STAGING** | bundle, cache, citations, prompts, providers, transport, tests (files appeared after 10:36) |
| `@kw/adapter-claude-code` | `$KN/packages/adapter-claude-code` | **STAGING** | constants, parse, types |
| Agent image, egress proxy, compose | `$KN/docker/{agent,egress-proxy}`, `compose.agent.yml`, `compose.dev.yml`, `scripts/agent-smoke.sh` | **STAGING**, exercised | Images built; smoke green at 10:39 |
| Neo4j | `$KN/docker/compose.dev.yml` | **STAGING**, running | `NEO4J_AUTH_FILE` compose secret; loopback ports |
| Run supervisor / runner | none | **UNOWNED** | lifecycle, capture, copy-out, bundle, import |
| Independent observer (Tetragon) | spike policies only (`$SP/research/observation-spike/tetragon/*.yaml`) | **UNOWNED** | the only kernel-level evidence source |
| Workspace snapshotter | none | **UNOWNED** | the change-mismatch input |
| Evidence store | smoke writes a flat `MANIFEST.sha256` only | **UNOWNED** | CAS + chained manifest |
| Safeguard workflow + verifier | none | **UNOWNED** | demo steps 8-10 |

### 2.3 PRD comparison (PRD §14 item 3)

The full requirement-by-requirement matrix is Appendix A. Summary by PRD area:

| PRD area | Where it stands | Biggest gap |
|---|---|---|
| FR-1 sessions | Review works on fixtures. Live session creation: smoke script only. | The supervisor creates no Run row yet. |
| FR-2 independent collection | Proxy log + read-only boundary exercised; Tetragon proven in the spike | **No owner** for observer and snapshotter. Today the only owned independent source is the proxy log. |
| FR-3 agent logs | stream-json, hooks and transcript captured in the container (10:39) | Normalizer (adapter) is partial; no live ingest |
| FR-4 discrepancies | Staging engine; fixtures cover 4 of 5 categories | No outcome-mismatch or concurrency fixture; correlation enum mismatch (fixed by D12) |
| FR-5 investigation | UI built on fixture data | Live correlations; raw evidence store |
| FR-6 lifecycle | Built with append-only history | "Resolved" not tied to verification (§5.8); recurrence fingerprints (cut-able) |
| FR-7 ai& | Docs VERIFIED; staging provider | No call made yet; `ai_calls` persistence |
| FR-8 Neo4j | Staging projection + constraints; server running | Graph UI unowned; queries not yet run on the container |
| FR-9/10 safeguards and verification | Schema fields exist | Workflow and verifier unowned |
| FR-11 coverage | Schema + panel built; fixture data | No live coverage computation |
| §9 security | Read-only policy mounts, no-route network, loopback API | No append-only triggers on `events`/`evidence`; no mutation token; no retention doc |
| §10 acceptance | 13 of 29 met on fixtures (foundation) | Everything live |

### 2.4 Conflicts found (PRD §14 item 7)

**Between the repository and the PRD:**

| # | Conflict | Recommendation |
|---|---|---|
| P1 | Overview counts include fixtures by default (`FixtureFilter` default `include`). PRD §6.3: "no fake production metrics". | Default `exclude` once live runs exist; run the live demo on a separate DB (`KW_DB_PATH=data/kw-live.db`, already supported) |
| P2 | `events`/`evidence` tables are mutable; PRD §7.2 says evidence is append-only where practical | Migration 002 triggers (§5.7 S3) |
| P3 | A `system` actor can confirm a finding; PRD FR-7: AI must never confirm | API guard: `→ confirmed` only by a `user` actor, with observed support or a note (§5.8) |
| P4 | `→ resolved` requires only a note; PRD FR-6: "new evidence establishes" | Guard requiring a verification run (D15) |
| P5 | No Claude Code stream-json source in `EventSource`; the PRD expects final response and tool results | Add `claude_code_stream_json` (S1) |
| P6 | Duplicate event with different content is silently dropped (`INSERT OR IGNORE`); PRD: missing or conflicting telemetry must be visible | Content-hash compare and count into coverage `errors` (C9) |
| P7 | README says `data/kernel-witness.db`; code uses `data/kw.db` | Fix README |
| P8 | Retention constant shown in Settings but not documented or enforced; PRD §9: documented retention policy | `docs/RETENTION.md` + manual purge (§5.10) |
| P9 | A developer status change on a fixture finding is written with `is_fixture: false` | Inherit `is_fixture` from the finding |

**Between the design drafts and the foundation build** (all resolved in favour of the build unless it violates the PRD):

| # | Topic | Design said | Built / staging | Resolution |
|---|---|---|---|---|
| C1 | SQL layer | better-sqlite3 + Drizzle | `node:sqlite`, plain SQL migrations | Keep built |
| C2 | Ports | 7777 / 7300 | 4600 / 4601 | Keep built |
| C4 | IDs | `prefix_` + 26 base32, ULID runs | `evt_` + 64 hex over U+001F-joined parts; others 24 hex | Keep built; add golden-vector tests |
| C5 | Provenance vocabulary | three different vocabularies | `basis reported\|observed\|derived`, fixed per source | Keep built; supervisor events → `observed` via `sandbox_runtime` |
| C6 | Source names | `cc.*`, `obs.*` | `claude_code_*`, `kernel_tracer`, `network_proxy`, `git_observer`, `sandbox_runtime` | Keep built; Tetragon → `kernel_tracer`, tinyproxy → `network_proxy`, snapshot manifest → `git_observer` (label "Repository diff observer") |
| C7 | Event richness | nested envelope | flat record + `unavailable_fields[]` + `limitations[]` | Add one `details` JSON column (S2) |
| C8 | Append-only | triggers everywhere | status history only | S3 |
| C10 | Finding guards | DB triggers | transitions + note | API guards (§5.8) |
| C11 | Safeguard model | revisions + content hash | three status columns | Keep columns; add `content_sha256`, `proposed_by`, history (S4) |
| C12 | Actors | `developer\|supervisor\|ai_provider\|retention_job` | `user\|system` | Keep built; AI provenance in `safeguards.proposed_by` and `ai_calls` only |
| C13 | Fixture separation | `origin` enum, raw replay | `is_fixture` flag, normalized fixtures | Keep flag; §5.12 |
| C14 | Graph feed | outbox + worker | synchronous per-run projection | Keep staging |
| C15 | Neo4j version | 2026.09.0 | 5.26.32 running | Keep 5.26.32 (X1) |
| C16 | Process identity | `(run, boot_id, pid, start)` | `(run, pid)` | Tetragon `exec_id`; fall back to pid with `identity_quality: weak` |
| C17 | Agent mounts | one volume; managed files via `putArchive` | volume + read-only binds for `/etc/claude-code`, `/opt/kw/kw-hook.mjs`, hooks volume | Accept the read-only binds, sourced only from `~/.kernel-witness/runs/<run>/`; a `docker inspect` mount guard rejects anything else |
| C18 | Model credential | proxy-injected API key | user decision: OAuth token in the agent env | Reflect the decision; disclose R3 |
| C19 | Reported channel | HTTP hook relay | command hooks to an agent-writable volume | Fine as reported data; host-captured stream-json is primary |
| C20 | Entrypoint flags | `--session-id`, explicit mode | neither set; `KW_MAX_TURNS=3`, `KW_MODEL=haiku` | Fix in V0 (§4.1.4) |
| C21 | Change record | `docker diff` + git shadow repo | not built | sha256 walk (§5.5); `docker diff` misses volume writes (spike L1705-1727) |

---

## 3. Observation boundary and enforcement (PRD §14 item 6)

### 3.1 Chosen layered design

The rule set before the spike: *if Tetragon works under Docker Desktop, it is the primary observer; otherwise strace sidecar + egress proxy + snapshots.* **Outcome: Tetragon works, so it is primary** (EMPIRICAL, spike L1033-1050, L1053-1133, L1263-1436, L1842-1873).

| Layer | Role | Mechanism | Runs where | Status |
|---|---|---|---|---|
| **B. Boundary** | Limits what the agent can reach at all | Disposable container: uid 1000, `cap_drop: [ALL]`, `no-new-privileges`, Docker default seccomp, `pids_limit 512`, `mem_limit 2g`. Only network is `internal: true`; only peer is the egress proxy | Docker Desktop VM | EMPIRICAL (spike L1468-1520; `smoke/preflight.txt` P2-P12) |
| **O1. Primary independent observer** | Process tree, file access on watched paths, connect attempts; LSM file-open denials | Cilium Tetragon sidecar `--privileged --pid=host --cgroupns=host`, BTF mounted. Per-run policies scoped with `matchNamespaces Pid In <agent pid-ns inode>` | VM, outside the agent's pid namespace | EMPIRICAL on v1.7.0. **Not yet in `compose.agent.yml`; no owner** |
| **O2. Egress decision log** | Domain-level allow/deny for every outbound attempt that can leave | tinyproxy 1.11.3, `FilterDefaultDeny Yes`, `ConnectPort 443`, allowlist `api.anthropic.com`, `platform.claude.com`, `claude.ai`; stderr pulled by the host | VM, trusted container | EMPIRICAL (spike L1549-1568; `smoke/egress-proxy.log`) |
| **O3. Authoritative change record** | Before/after state of `/workspace`, including `.git/**` and ignored files | Pure `lstat` + sha256 manifest walk in a `--network none` container with the volume read-only; post snapshot with the agent paused | VM, trusted short-lived container, driven by the host | Mechanism straightforward; git temp-index variant EMPIRICAL (spike L1656-1703); walk UNVERIFIED until V1 |
| **R. Reported side** | What the agent says it did | `claude -p --output-format stream-json` on container stdout, captured by the host; managed command hooks spooled to `/kw-hooks`; transcript copied at the end. All `basis: reported` | Produced inside the untrusted container | EMPIRICAL in the container, including tool-call hooks (10:39 run) |
| ~~F. strace fallback~~ | — | Not built for the demo (X13). Proven viable: invisible to the agent when in the VM host pid namespace (spike L518-539), about 20-80x overhead | — | — |

### 3.2 Why this design

1. **The VM kernel runs eBPF and BPF-LSM**: 6.12.54 with BTF, LSMs `capability,bpf`, `CONFIG_BPF_KPROBE_OVERRIDE=y`. Tetragon detected `lsm: true, override_return: true` (spike L118-168, L1046).
2. **Attribution is strong.** `process_exec` events carry `exec_id`, `parent_exec_id`, full argv, cwd, uid and the docker container id. File events carry the resolved container path, the permission mask and the return value, and caught a bash-builtin read of `.env` with no exec (spike L1096-1132, L1189-1203).
3. **The file-open block leaves evidence.** An LSM `file_open` Override returned EPERM for absolute, relative and symlink paths and emitted `process_lsm` / `KPROBE_ACTION_OVERRIDE`. Scoped to one container, another container could still read the file (spike L1327-1401, L1848-1851).
4. **The agent cannot see or kill Tetragon** (`kill -0` gives "No such process"; spike L1443-1451). A strace sidecar sharing the agent's pid namespace was visible and killed (spike L505-516).
5. **Rejected alternatives fail here** (all EMPIRICAL):
   - fanotify can't mark overlay or macOS binds and has no permission events (L599-679);
   - inotify has no attribution and drops host-side events (L724-764; V:`observation-spike-13`, worse than reported);
   - bpftrace 0.20.2 asserts on a `curtask` dereference (L811-833);
   - macOS eslogger/fs_usage/dtrace need root, and eslogger also needs TCC Full Disk Access (V:`observation-spike-39`);
   - Claude Code's bwrap sandbox cannot nest under default seccomp (L1599-1639);
   - `docker diff` omits volumes (L1711-1726).
6. **Scope of the claim:** "best choice" is relative only to the tools tested. auditd (`CONFIG_AUDIT` is present) and other eBPF agents were not evaluated (spike fact-check).

### 3.3 Trust boundary

```
 macOS host (TRUSTED; SIP on; no root tools) --------------------------------------------------------
 |  Browser -> Vite UI 127.0.0.1:4601 -> Fastify API 127.0.0.1:4600 (node:sqlite: data/kw.db | kw-live.db)
 |  Supervisor (in apps/server; single writer of AUTHORITATIVE EVIDENCE):                            |
 |    ~/.kernel-witness/ (0700): blobs/sha256/.., runs/<run>/manifest.ndjson, seal.json,              |
 |                               runs/<run>/claude-managed/ (per-run policy, mounted RO)              |
 |    ~/.kernel-witness/claude-oauth-token (0600) -> injected as env into the AGENT ONLY             |
 |  Docker Engine API socket: host only, never mounted into any container                           |
 ---------------------------------------------|------------------------------------------------------
   pulls: docker logs / cp / tetra getevents   |  starts, holds, pauses, inspects, removes
 Docker Desktop Linux VM (one shared kernel 6.12.54-linuxkit) ----------------------------------------
 |  TETRAGON (TRUSTED, privileged, --pid=host --cgroupns=host)   <- not visible to the agent          |
 |    hooks: exec/exit, security_file_open/permission (watched prefixes), lsm file_open (Override),   |
 |    tcp_connect; policies per run, scoped to agent pid-ns inode, unloaded at run end               |
 |  +------------------- network kw-agent-internal (internal: true, 10.231.7.0/24) ---------------+   |
 |  | AGENT CONTAINER (UNTRUSTED) uid 1000, cap_drop ALL, no-new-privileges, default seccomp       |   |
 |  |   claude -p --output-format stream-json ... </dev/null   --stdout--> host                    |   |
 |  |   env: CLAUDE_CODE_OAUTH_TOKEN (agent CAN read it), HTTPS_PROXY=kw-egress-proxy:8888         |   |
 |  |   mounts: /workspace RW volume (scenario copy) | /kw-hooks RW volume (REPORTED spool)        |   |
 |  |           /etc/claude-code RO (per-run managed settings) | /opt/kw/kw-hook.mjs RO           |   |
 |  |   NOT present: ~/.claude of host, Keychain, ~/.ssh, docker.sock, evidence store, ai& key,    |   |
 |  |                Neo4j password                                                                |   |
 |  |        | CONNECT only (direct TCP/UDP: ENETUNREACH; external DNS: no answer)                 |   |
 |  | EGRESS PROXY (TRUSTED) tinyproxy, read_only, cap_drop ALL (+SETUID/SETGID), allowlist RO     |   |
 |  +--------|-------------------------------------------------------------------------------------+   |
 |           +--> network kw-egress (bridge) --> api.anthropic.com | platform.claude.com | claude.ai |
 |  SNAPSHOT container (TRUSTED, --network none, /workspace RO) -> manifest to host                  |
 |  NEO4J (TRUSTED) 127.0.0.1:7697/7484 on the host only; never on kw-agent-internal                 |
 ------------------------------------------------------------------------------------------------------
```

- **Authoritative evidence lives only on the host.** The supervisor pulls it from the Tetragon capture, the proxy's stderr, the agent's stdout and the snapshot container. It writes content-addressed blobs and a chained manifest. No authoritative store is mounted into any container.
- **Provenance comes from the channel, never the payload.** stream-json bytes are host-captured, but their content is agent-reported. The `/kw-hooks` spool is agent-writable, so it is reported.
- **Two recorded deviations from the integrity design:**
  - **Credential.** The OAuth token is passed in the agent's env (user decision), not gate-injected, so the agent can read it (R3).
  - **Read-only binds.** `/etc/claude-code` and the hook forwarder are bind mounts, not `putArchive` uploads. Writes to them were denied (EMPIRICAL P3-P5). The binds must point at per-run copies under `~/.kernel-witness/runs/<run>/`.

### 3.4 FR-2 categories: what can be observed, blocked, or not established

Attribution quality, strongest first:
- **kernel-direct**: Tetragon record with exec chain and container id.
- **channel-direct**: from a trusted container, but with no process.
- **time-correlated**: joined by time window only; an inference.
- **reported**: produced by the agent.

| FR-2 category | CAN observe | CAN block, and how the block appears | CANNOT establish |
|---|---|---|---|
| **Tool calls and results** | **Reported only:** stream-json `tool_use`/`tool_result` with `tool_use_id`; managed hooks `PreToolUse`/`PostToolUse`/`PostToolUseFailure`/`PostToolBatch` (EMPIRICAL in the container, 10:39); transcript copy. **Corroboration:** Bash children appear as Tetragon `process_exec` under `claude`. Read/Edit file events are attributed to the `claude` process; the join to a `tool_use_id` is **time-correlated**. | Managed permission rules (agent runtime; the decision is **reported**). Independent blocks act only on side effects (LSM file-open, proxy deny). The model sees "Operation not permitted" or "CONNECT tunnel failed, response 403". | That a tool ran as reported or its result is true. Which `tool_use_id` caused a syscall inside the single `claude` process. That a reported denial prevented the effect: on the host, `Bash(cat .env)` passed while a hook blocked `Read` [cc-09, cc-21]. |
| **Process execution** | Tetragon `process_exec`/`process_exit` for every process in the agent container: binary, argv, cwd, uid, `exec_id`, `parent_exec_id`, container id; exit signal. **kernel-direct.** pids are VM-namespace pids. Pre-existing processes arrive via procfs scan. | Fork storms capped by `pids_limit 512`. Per-binary exec blocking is out of v1 (upstream #5528: one exec Override can flood hundreds of `PROCESS_LSM` events). | Activity beyond hooked syscalls; container pid mapping; completeness under load (loss not yet measured; a missing exec is not proof of none). |
| **File access attempts** | Tetragon `security_file_open` / `security_file_permission` (MAY_READ/MAY_WRITE) **only on prefixes a per-run policy selects**; resolved path, return value, binary, pid. **kernel-direct.** On overlay, every operation emits **two** events. | **LSM `file_open` Override** scoped by pid-ns inode. The process sees **EPERM** regardless of the configured errno (upstream #5781, open). Evidence: `process_lsm` with `KPROBE_ACTION_OVERRIDE`, policy name and process. **Never** use a Sigkill-only `security_file_permission` policy: an mmap read got all 42 bytes (spike L1835-1839), and Sigkill is not a block (V:`observation-spike-21`). | Open ≠ read ≠ used ≠ sent. Unwatched paths are not recorded. Bypass resistance was not tested against hardlinks, bind aliases, `io_uring`, `/proc/self/fd` or `splice`. DAC denials (EACCES) fail before the traced hooks and leave **no** event. |
| **File modifications** | **Authoritative:** pre/post sha256 manifests of `/workspace`, including ignored files and `.git/**` (M/A/D, hashes). **Optional:** Tetragon MAY_WRITE on `/workspace/` (overhead P5). Writable layer outside volumes: `docker diff`. | Read-only mounts (EMPIRICAL P3-P5). Write-mode LSM blocking **not tested**. This kernel lacks `CONFIG_SECURITY_PATH`, so unlink/rename/truncate/chmod hooks don't exist. | Intermediate states (create-then-delete between snapshots); who changed a file when no write policy matched; final content beyond post-snapshot time. |
| **Network** | Proxy log: `CONNECT host:port`, allow/deny reason, `Established` (upstream TCP opened). Client **by IP only** → container-level, **time-correlated** for the process. Tetragon `tcp_connect` (saddr/daddr/ports, process; on the internal network daddr is always the proxy; `SYN_SENT` only). No DNS query log. | **No route** (`internal: true`): direct TCP/UDP give `ENETUNREACH`; direct HTTPS gives "Could not resolve host" (EMPIRICAL P10-P12). **Proxy deny:** curl exit 56 `CONNECT tunnel failed, response 403` for non-allowlisted domains and non-443 ports (EMPIRICAL P8-P9). ~~tcp_connect Sigkill~~ is not a block (X9). | Bytes sent or received (tinyproxy logs none); content or method inside TLS; which process made a proxied request; exfiltration to an allowed host (for example api.anthropic.com with another key) or domain fronting. Whether Tetragon sees direct connects that fail at routing (P2). Activity of Anthropic server-side tools (WebSearch/WebFetch; deny them, D11). |
| **Permission decisions** | **Reported:** `result.permission_denials` (documented as the authoritative list), `tool_result_meta.permission_decision` (undocumented, best-effort), `PermissionRequest` hook. **Independent:** proxy deny records, Tetragon `process_lsm` records, non-zero return values on watched paths. | Managed permission rules, root-owned and read-only, with `disableBypassPermissionsMode`. Repo bypass mode was not applied (EMPIRICAL C4). Independent enforcement as above. | That a reported deny prevented the effect by another path; that a reported allow executed; EACCES/EROFS on unwatched paths (visible only in agent output). |
| **Agent-reported actions** | stream-json `result` record (`result`, `is_error`, `num_turns`, `permission_denials`, `terminal_reason`) captured live on the host; transcript copied after the run. | n/a | Truthfulness: a same-uid process can forge stream lines and edit the transcript. Used only to *create* discrepancies, never to suppress one. |
| **Repository changes** | Pre/post manifests as above, plus HEAD and refs read **as files** from the manifest (no git execution) | Not in v1. The agent works on a copied volume, never the developer's checkout. | Intermediate commits later amended or reset; semantic correctness. |

### 3.5 Empirically verified versus only documented

| Claim | Status | Evidence |
|---|---|---|
| Docker Desktop 4.57.0 / Engine 29.1.3 / kernel 6.12.54, BTF, LSMs `capability,bpf`, no Yama | EMPIRICAL (this install only; 4.57.0 is no longer downloadable) | spike L53-181; V:`observation-spike` omission |
| Default seccomp blocks user namespaces; Claude Code bwrap cannot nest | EMPIRICAL | spike L193-200, L1599-1639; `$SP/research/claude-code/container-spike/` |
| Tetragon v1.7.0 starts from the official Docker command in about 1 s | EMPIRICAL (command DOC) | spike L1035-1050 |
| Exec/exit with exec chain and container id; file events on watched paths, including builtins | EMPIRICAL | spike L1080-1203 |
| LSM Override blocks open with EPERM, scoped to one container | EMPIRICAL | spike L1327-1341, L1848-1856 |
| Any `argError` is delivered as EPERM | EMPIRICAL; upstream #5781 (open) | spike L1868-1871 |
| Sigkill-only read policy bypassed by mmap; Sigkill is not a block | EMPIRICAL + VERIFIED (correction) | spike L1835-1839; V:`observation-spike-21/26` |
| Agent cannot see or signal Tetragon | EMPIRICAL | spike L1443-1451 |
| Internal network + tinyproxy: allowed 200 / denied 403 / direct ENETUNREACH / no external DNS | EMPIRICAL (spike and `kw-agent`) | spike L1491-1568; `smoke/preflight.txt` |
| Claude Code honours `HTTPS_PROXY`; with setup-token auth only `api.anthropic.com` was contacted | EMPIRICAL (one short run) | `smoke/run.json` `egress` |
| Authenticated `-p` run in the container; tool-call hooks with `tool_use_id`; stream-json host-captured | EMPIRICAL (10:39) | `smoke/run.json`, `smoke/hooks.agent-reported.ndjson` |
| Managed hooks fire despite repo `disableAllHooks`; repo/local hooks ignored; repo bypass mode not applied | EMPIRICAL (C1-C4) | `smoke/conformance.txt` |
| Policy dir and hook forwarder not writable by uid 1000 | EMPIRICAL | `smoke/preflight.txt` P3-P5 |
| `allowManagedPermissionRulesOnly` ignores project/CLI allow rules; in `-p`, unanswerable prompts become denials | VERIFIED docs + host probe run1 ("This command requires approval"); **not yet exercised in the container** | [cc-17], critiques B4/M5 |
| `security_socket_connect` sees direct or failed connects | DOC example only | P2 |
| `io_uring` denied by Docker default seccomp | UNVERIFIED (landscape fact-check pending) | P8 |
| `tetra getevents -o json` streamed to the host without loss | UNVERIFIED | P4 |
| Tetragon v1.7.1 fixes duplicate LSM hooks and process-cache races | VERIFIED as release content (spike fact-check); not run here | P6 |
| Overhead about 1.0x / 1.8x / 2.9x | EMPIRICAL microbenchmark, **confounded**; no budget may rest on it | V:`observation-spike-28` |

### 3.6 FR-11 coverage statements shown per run

The panel renders the built `CoverageReport` (`packages/schema/src/entities.ts`). The supervisor fills it from collector health, never from the agent. `{}` marks runtime values. **Banned anywhere:** "All safe", "Secure", "No issues", "complete monitoring", "data exfiltrated", "file uploaded".

**Sources (one entry per collector):**

| `source` | Categories | Attribution | Label when active |
|---|---|---|---|
| `kernel_tracer` | process_execution, file_access, file_modification, network | yes | "Tetragon {version} (eBPF), outside the agent container. Process and file events for this container only; watched paths: {paths}." |
| `network_proxy` | network | no | "Egress proxy (default deny, allowlist {n} hosts, sha256 {allowlist_sha256}). Records destination and allow/deny per request; client identified by container IP only." |
| `git_observer` | repository_changes, file_modification | no | "Pre- and post-run file manifests of /workspace taken outside the agent; post manifest with the agent paused." |
| `claude_code_stream_json` | tool_calls, permission_decisions, agent_reported_actions | no | "stream-json captured live on the host. **Reported by the agent.**" |
| `claude_code_hooks` | tool_calls, permission_decisions | no | "Claude Code managed hooks. **Reported by the agent**; the spool is agent-writable." |
| `claude_code_transcript` | tool_calls, agent_reported_actions | no | "Transcript copied at end. **Reported by the agent.**" |

`errors[]` holds exact collector errors, for example `"tetragon: loss counters not captured"`, `"proxy: log stream ended early"`, `"snapshot: post manifest not taken (run aborted)"`.

**Categories (nominal status and note):**

| Category | Nominal | Note | Degraded |
|---|---|---|---|
| process_execution | observed | "Every process start and exit in the agent container, with parent chain and arguments (Tetragon). Process IDs are Docker VM IDs." | partial: "Tetragon gap {from}-{to}." / unavailable: "No process observer active." |
| file_access | partial | "Recorded only for watched paths: {paths}. An open or read event does not prove the content was used. Access to other paths is not recorded." | unavailable: "No file-access observer active; file access is unknown." |
| file_modification | partial | "Before/after state of /workspace from trusted manifests. Files created and deleted during the run, and changes on other volumes, may not appear." | "Final file state unknown: post-run manifest missing ({reason})." |
| network | partial | "All egress goes through the Kernel Witness proxy; direct connections have no route. Each attempt's destination and allow/deny is recorded. Bytes and content are not recorded; the requesting process is matched by time only." | unavailable: "Proxy log missing; network attempts unknown." |
| permission_decisions | partial | "Claude Code's own decisions are reported by the agent. Independent denials: {n_proxy} by the egress proxy, {n_lsm} by Tetragon file blocks." | — |
| tool_calls | partial | "Reported by the agent (stream-json, hooks). Shell commands and file access can be corroborated by process and time; individual tool calls cannot be independently confirmed." | unavailable: "No reported tool-call stream captured." |
| agent_reported_actions | observed | "Final response captured live on the host. Content is the agent's own account." | partial: "Run ended without a final result record ({terminal_reason})." |
| repository_changes | observed | "Pre-run and post-run manifests (tracked and ignored files, HEAD and refs as files). Intermediate states are not captured." | unavailable: "Snapshot failed: {reason}." |

**Top-level fields:**
- **`network_outcomes_observable`** is true only while the proxy log is captured end to end. The panel always adds: "allow/deny at the proxy is observed; bytes, content and process attribution are not."
- **`final_state_complete`** is true only if all of these hold:
  - the agent was paused or exited before the post manifest;
  - the post manifest succeeded;
  - a stream-json `result` exists, `SessionEnd` fired, and no background tasks remain (claude-code fact-check);
  - every collector reached its end marker.
- **`unsupported_capabilities`** (fixed strings):
  - content of allowed HTTPS connections;
  - bytes per connection;
  - process attribution for proxied requests;
  - DNS query log;
  - file access outside watched paths;
  - intermediate file states;
  - independent confirmation of individual tool calls;
  - activity of Anthropic server-side tools;
  - activity on the macOS host outside Docker;
  - file deletes, renames and chmod (kernel lacks path hooks).
- **`level`**:
  - `complete` requires every configured source active the whole run, no gaps, **loss counters captured and zero**, and `final_state_complete`. It is displayed as **"Complete for configured sources"**, never bare.
  - `partial` covers any gap, degraded source or unmeasured loss.
  - `minimal` means reported sources only.
  - Zero findings render "No findings in the observed scope (coverage: {level})".
- **Additive schema proposal:** optional `gaps: {collector, from, to, dropped}[]` and `enforcement: {mechanism, scope, active}[]` on the Zod `CoverageReport`. Until they exist, gaps go into `sources[].errors`.

### 3.7 Residual risks the product must disclose

| # | Risk | Disclosure or mitigation |
|---|---|---|
| R1 | **Container escape gives root in the shared VM**, which defeats Tetragon and the proxy. Docker Desktop file sharing may expose `/Users`, including `data/` and `~/.kernel-witness` (UNVERIFIED for this host: Settings → Resources → File sharing). | Non-root, cap-drop ALL, no Docker socket, pinned images. Stated as the main limit in the README. |
| R2 | **Tetragon is privileged and VM-wide.** A mis-scoped enforce policy can deny other containers; another session shared the daemon. Any process with Docker access can `tracingpolicy delete`. | Generate every policy per run with a pid-ns selector, delete it at run end, never load global enforce policies. |
| R3 | **The OAuth token is readable by the agent** (env, `/proc/<pid>/environ`; Yama absent). | Disclose; dedicated account; rotate after the demo; exfiltration bounded to allowlisted Anthropic hosts. Add `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` (DOC; side effects UNVERIFIED). |
| R4 | **Reported data can be fabricated** (stdout lines, hook spool, transcript). | "Reported by agent" badge everywhere; violations derived only from independent evidence. |
| R5 | **Coverage gaps and event loss** (watched paths only; loss unmeasured; overlay duplicates; export rotation). | Coverage panel; capture loss counters (P4); missing events are never proof of absence. |
| R6 | **Exfiltration through allowed destinations**, plus server-side tools. | Deny `WebSearch`/`WebFetch` (D11). Disclose that anything the agent reads may reach its model provider. |
| R7 | **Known Tetragon defects:** #5781 (EPERM only), #5528 (event flood on exec Override), overlay doubles, arm64 override breakage on newer kernels (#4284). | Show "blocked (EPERM)"; dedupe on ingest; no exec Override; freeze the kernel (D7). |
| R8 | **Blinding window**: events lost before a watchdog notices. | Per-collector gaps; findings in a gap window get lower confidence. |
| R9 | **Results are environment-specific** (Docker Desktop 4.57.0 / 6.12.54, Tetragon 1.7.0; ECI or Docker Sandboxes would break the design). | Record Docker Desktop, kernel, Tetragon and Claude Code versions in `run.open`; re-run boundary self-tests at each start. |
| R10 | **No in-container Claude Code sandbox** (bwrap can't nest). | Disclosed; the container + Tetragon + proxy replace it. |
| R11 | **Clock domains** (VM, container, host) with unmeasured skew. | Tolerant windows; the UI shows Δt. |
| R12 | **Unobserved macOS host activity.** | Listed as unsupported. |
| R13 | **Repo-supplied Claude Code config under `-p`** (env block, `apiKeyHelper`, `.mcp.json`, skills) and **mods** are not covered by `allowManagedHooksOnly`. Whether a repo can set `ANTHROPIC_BASE_URL` is untested. | `--strict-mcp-config`, `allowManagedModsOnly`, record loaded plugins and mods; P9; KW-authored scenario repos only in the demo. |
| R14 | **Claude Code background traffic** and fork subagents (default-on in `-p` since 2.1.302). | Disable non-essential traffic and auto-update; deny `Task` for v1 runs (D11); classify residual harness traffic. |

### 3.8 Remaining probes and decision rules (all parallelizable; minutes each)

| Probe | Status | Decision rule |
|---|---|---|
| P1 Authenticated tool-using run | **Half done** (10:39: Bash + Read hooks with `tool_use_id`). Remaining: secret read + edit + `npm test` under the V0 managed policy. | If a deny probe appears in `permission_denials` → `allowManagedPermissionRulesOnly` path EMPIRICAL. If any host outside the allowlist is requested → add only if Anthropic-owned and documented. |
| P2 Tetragon on `kw-agent-internal`: direct `connect()` under `tcp_connect` vs `security_socket_connect` | open | Use whichever sees it. If neither does → disclose "direct attempts blocked but not attributed". |
| P3 Gated start: entrypoint waits for a supervisor go-signal before `exec claude` | open | Works → load per-run policies in that window. Fails → observe-only filtering by container id, and SG-C (kernel enforcement) is dropped from v1. |
| P4 Event transport and loss: `tetra getevents -o json` to host, metrics on | open | Use it if ordered JSON arrives with no loss over 5 minutes and loss counters are readable. Otherwise export file with raised rotation plus continuous copy. |
| P5 Write-observe policy on `/workspace/` during a real run | open | Keep if no drops and no visible slowdown; else manifests only for writes, stated in coverage. |
| P6 Tetragon pin | open | Default v1.7.0 by digest (validated). v1.7.1 only if P2-P5 pass on it. |
| P7 Managed-settings tamper for hooks | **Done** (C1-C4 pass) | Hooks shown as "managed, intact". |
| P8 `io_uring_setup` and mmap probes | open | If `io_uring` gives EPERM/ENOSYS → self-test; else add an explicit seccomp deny. |
| P9 Repo-supplied config: `.claude/settings.json` with an `env` block (`ANTHROPIC_BASE_URL`), `apiKeyHelper`, `.mcp.json`; also `--restricted` | new | If any applies under managed settings → reject scenario repos containing `.claude/` or `.mcp.json` at setup, and disclose. |
| P10 `unshare -p` / `unshare -U` inside the agent must fail | new | Fails → pid-ns scoping holds (self-test each run). Succeeds → add seccomp denies for `unshare`/`setns`/`clone3` namespace flags before any enforcement claim. |
| P11 Reachability of `host.docker.internal:4600/7697` from the agent and from bridge containers | new | Agent must fail (no route). If bridge containers succeed → require the mutation token (§5.11) before demo. |
| P12 `docker cp` from a paused container | new | Works → copy while paused. Else copy after stop (the writable layer survives until `rm`). |

---

## 4. Integration approach (PRD §14 item 5)

### 4.1 Claude Code adapter

**4.1.1 What it is.** Claude Code 2.1.302 offers four self-records: hooks, headless stream-json, the session transcript, and OpenTelemetry (VERIFIED [cc-02, cc-29, cc-41]). All four come from the `claude` process inside the untrusted container, which shares a uid with the agent's subprocesses. The adapter therefore emits **only `basis: reported` events** (`integrations.ts`: "Produces only basis 'reported' events"). Raising a reported event to `matched` is a correlation result in `@kw/analysis`, never an adapter output.

**4.1.2 Channels, ranked**

| # | Channel | Role | Caveats |
|---|---|---|---|
| 1 | **stream-json on stdout** | Primary reported record; bytes written by the host to the evidence store. Every `tool_use`/`tool_result` carries `tool_use_id`; `system/init` gives model, permission mode, tools, plugins, version; `result.permission_denials` is the documented denial list (VERIFIED [cc-27, cc-55]) | `tool_result_meta.permission_decision` is undocumented: best-effort, version-gated. No `result` on SIGKILL/OOM/crash |
| 2 | **Managed command hooks** | Real-time feed (EMPIRICAL in the container). Payloads carry raw content (redact at ingest) | A path-rule-denied Read fires **no** Pre/Post hook [cc-22]. `PermissionRequest` has no `tool_use_id`. `PermissionDenied` fires only in auto mode: subscribe harmlessly, never use it as a denial source |
| 3 | **`PostToolBatch` + `permission_denials`** | Reconciliation, so no attempted call is missed (`PostToolBatch` listed all 8 calls in probe run1 [cc-23]) | Behaviour on `--max-turns` cut-off, SIGTERM or crash is UNVERIFIED. Subagent calls are not covered (deny `Task`) |
| 4 | **Transcript** | Copied after the run for enrichment (`permissionDecision`, `toolDenialKind`) | Internal format; contains the operator's email and org UUID → redact; agent-writable |
| 5 | OpenTelemetry | **Skipped for v1** | Duplicates 1-2. Note for later: `claude_code.managed_settings_resolved` with `OTEL_LOG_MANAGED_SETTINGS=1` carries a sha256 of the resolved managed policy (DOC) |

**Join key:** `tool_use_id` (`toolu_…`) across stream-json, hooks, `permission_denials` and the transcript [cc-31].

**4.1.3 Outcome classification.** These rules are multi-source and version-pinned. Several depend on message-text matching, so the resulting correlation is marked **inferred** and regression-tested on captured runs (claude-code fact-check).

| Signals | Label |
|---|---|
| PreToolUse `permissionDecision: deny` + `is_error` result + in `permission_denials` | `blocked_by_hook` |
| `<tool_use_error>` with no Pre hook, or `toolDenialKind: permission-rule`, + in `permission_denials` | `blocked_by_rule` (the only agent-layer block credited to a safeguard; D9) |
| "Requires approval" denial in `-p` | `blocked_needs_approval` (counted as `blocked_by_other_layer`) |
| `PostToolUseFailure` with EPERM/EACCES, **not** in `permission_denials` | `failed_os_denied`; shown as "blocked (OS)" only when Tetragon or the proxy attests the layer (Claude Code records these as `accept` [cc-34]) |
| `PostToolUse` | `completed (reported)` |

**4.1.4 Launch contract (changes for V0)**

```
claude -p "$KW_TASK" --output-format stream-json --verbose --include-hook-events \
  --session-id "$KW_SESSION_UUID" --permission-mode dontAsk \
  --model "$KW_MODEL_FULL_ID" --max-turns 25 --strict-mcp-config </dev/null
env: CLAUDE_CODE_OAUTH_TOKEN, HTTPS_PROXY, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1,
     DISABLE_AUTOUPDATER=1, CLAUDE_CODE_DISABLE_AUTO_MEMORY=1, CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1
```

1. **Pin a full model ID.** The alias `haiku` resolved to different models across probe runs. Every clean container is a "first session", where flag-gated defaults can differ (claude-code fact-check). The 10:39 run resolved `haiku` → `claude-haiku-5-5`. Default: pin that (D10). Record `system/init.model`, `claude_code_version`, `plugins` and the mods list on the Run.
2. **Pass `--permission-mode dontAsk` explicitly.** The docs disagree about the default start mode (V:`claude-code-58`); the container started in `default` (EMPIRICAL C4). `dontAsk` auto-denies anything not pre-approved, so the session never waits (DOC).
3. **Generate a complete managed allow-list per scenario.** `allowManagedPermissionRulesOnly` ignores `--allowedTools`, `--settings` and project allow rules. The staging base policy allows only `Read, Glob, Grep, Bash(ls:*)`, so edits and `npm test` would be denied. Minimum for `invoice-kit`:
   - `Edit(//workspace/src/**)`, `Edit(//workspace/test/**)`, `Write(//workspace/src/**)`, `Write(//workspace/test/**)`;
   - `Bash(npm test)`, `Bash(node --test*)`, `Bash(git diff*)`, `Bash(git status*)`.
   
   Managed denies: `WebSearch`, `WebFetch`, `Task` (D11), plus the scenario policy.
4. **Managed keys:** `allowManagedPermissionRulesOnly`, `allowManagedHooksOnly`, `allowManagedModsOnly` (DOC), `disableBypassPermissionsMode`, `disableClaudeAiConnectors`. Keep `--strict-mcp-config`. **Do not use `--bare`:** it skips hooks and `CLAUDE.md`, and stops reading `CLAUDE_CODE_OAUTH_TOKEN` [cc-44].
5. **Policy delivery.** Files `0644` (a `0600` file on a macOS bind appears root-owned and unreadable). The entrypoint refuses to start unless uid 1000 can read every managed file. Parse each run's stderr for dropped or unreadable managed-settings notices; a hit sets `policy_load=failed`, and the run's enforcement claims become indeterminate. A server-managed (Team/Enterprise) policy would silently win, so confirm the account type (D9).

**4.1.5 Tamper resistance**

| Threat | Mechanism | Status |
|---|---|---|
| Agent edits project settings to drop a deny rule (hot reload) | Policy only in managed settings + managed-only keys | Host demo of the attack [cc-11]; the repo-hook part of the defence is EMPIRICAL (C1-C3); permission-rule part VERIFIED docs, not yet exercised |
| Agent writes the managed file or forwarder | Read-only bind, root-owned, uid 1000, cap-drop, no-new-privileges | EMPIRICAL (P3-P5) |
| Repo ships hooks, env, MCP, mods | Managed-only keys, `--strict-mcp-config`, P9 | Hooks EMPIRICAL; others DOC/UNVERIFIED |
| Agent forges hook records | Unavoidable (same uid). Spool named `hooks.agent-reported.ndjson`; the host stdout copy is the reference; native key = file position; a same-`tool_use_id`, different-content pair yields an `agent_record_conflict` diagnostic | Accepted, disclosed |
| Agent edits instruction files | Hash `CLAUDE.md`, `AGENTS.md`, `CLAUDE.local.md`, `.claude/rules/**`, subdirectory `CLAUDE.md` before and after; instruction safeguards live in managed `/etc/claude-code/CLAUDE.md`; auto memory disabled | Mechanism straightforward |

**4.1.6 Authentication.** `claude setup-token` prints a one-year, subscription-only, `user:inference`-scoped token (VERIFIED [cc-44]). `scripts/agent-smoke.sh` exports it as `CLAUDE_CODE_OAUTH_TOKEN` only in the subshell that runs `docker compose run agent`. **Works in the container** (EMPIRICAL 10:39). The evidence directory was scanned afterwards: `token_scan: clean`. The allowlist keeps three hosts. Only `api.anthropic.com` was used in this run; the docs say OAuth *sign-in* also needs `claude.ai`, `claude.com` and `platform.claude.com`, but setup-token runs do not sign in. Recommendation: trim to `api.anthropic.com` after a full scenario run shows nothing else is requested. That reduces the exfiltration surface.

**4.1.7 Safeguard mechanisms (FR-9): not interchangeable**

| Mechanism | Who enforces | Covers subprocesses? | Evidence of a block | v1 |
|---|---|---|---|---|
| **CLAUDE.md instruction** (managed `/etc/claude-code/CLAUDE.md`) | Nobody; model guidance | No | None (`InstructionsLoaded` proves loading only) | Yes, **GUIDANCE** badge |
| **Permission rule** (managed drop-in `managed-settings.d/50-kw-sg_<id>.json`) | Claude Code process | **No**: `python3 open()` returned the token past `Read(secrets/**)` [cc-20] | Reported `permission_denials` + observed absence of the access | Yes, **AGENT-ENFORCED**. Drop-in merge in the container is UNVERIFIED (P1) |
| PreToolUse hook | Claude Code | No; fails open unless `onFailure: block` | `hook_response` + denials | Deferred |
| **Environment restriction**: Tetragon LSM `file_open` Override on a path prefix; proxy deny | KW, outside the agent | **Yes**, every process in the container | Independent `process_lsm` record (EPERM) / proxy 403 | Yes, **ENVIRONMENT-ENFORCED**, "inside KW runs only" (D13). Not DAC: a DAC denial leaves no observed event |
| Regression scenario | n/a | n/a | Verification result | Templates only (FR-7.3 cut-able) |

Verification always records **which layer blocked**. "Not attempted" is never reported as "prevented".

### 4.2 ai& Inference

**4.2.1 Identity (VERIFIED [ai-01, ai-02]).** ai& Inc. (Yokohama) serves open-weight LLMs on GPUs in Japan through OpenAI- and Anthropic-compatible APIs. It is a listed host and sponsor of this hackathon. Credits appear only as prizes and Discord "sponsor credit support"; they are not promised to every team (V:`ai-and-23`). Docs: https://docs.aiand.com; spec: https://api.aiand.com/openapi.json.

**4.2.2 Endpoint and auth (VERIFIED).**
- Base URL `https://api.aiand.com/v1`, header `Authorization: Bearer sk-…`. Keys are org-scoped; limits are per org.
- Keyless `GET /v1/models` returns 200; inference without a key returns 401 (EMPIRICAL probe).
- We use `POST /v1/chat/completions`, documented as "fully compatible" with listed deviations: unlisted `reasoning_effort` levels round **up**; `max_tokens` at or above the context window gives 400; no `store`/`metadata`.
- Not used: `/v1/messages`, `/v1/responses`, and `model: "auto"` (sends text to a grading model, V:`ai-and-29`).
- Client: plain `fetch` or `openai` npm 7.36.0 (pin it), retries off, 60 s timeout. Read `X-Request-ID`, `X-Model` and `X-Reasoning-Effort`; send `X-Aiand-Metrics: true` for `X-Cost`.

**4.2.3 Models.** The keyed catalog is per org and per currency, and Tier 0 may see fewer models (VERIFIED [ai-15]). Strict `json_schema` "depends on the model", has no capability flag, and is best effort (VERIFIED [ai-11, ai-12]).

| Candidate | $/1M in·out | Reasoning off? | Strict-schema doc example | Role |
|---|---|---|---|---|
| `deepseek-ai/deepseek-v4-flash` | 0.15 · 0.25 | yes | yes, the most documented (V:`ai-and-13`) | **Default** |
| `zai-org/glm-5.3-flash` | 0.15 · 0.50 | no (`low` min) | yes (vision cookbook) | Alternative |
| `zai-org/glm-5.2` | 1.00 · 4.00 | yes | no | Quality fallback |
| `moonshotai/kimi-k3` | 3.00 · 12.50 | no | no | Only if judges want Kimi |

**None has been called.** Per-model behaviour is UNVERIFIED until the probe runs (4.2.9).

**4.2.4 Provider interface.** Failures are typed, never thrown, and unredacted text cannot be passed:

```ts
export interface InferenceProvider {
  readonly id: 'aiand' | 'null' | 'recorded';            // 'recorded' replays stored outputs for demos/tests
  status(): Promise<ComponentStatus>;
  explainFinding(b: RedactedBundle, o: CallOpts): Promise<InferenceResult<ExplanationV1>>;
  proposeSafeguard(b: RedactedBundle, o: CallOpts): Promise<InferenceResult<SafeguardProposalV1>>;
}
export type InferenceResult<T> =
  | { status: 'ok'; value: T; grounding: ClaimGrounding[]; meta: InferenceMeta }
  | { status: 'invalid_output'; errors: string[]; rawRef: string; meta: InferenceMeta }
  | { status: 'unavailable'; reason: 'not_configured'|'auth'|'insufficient_credits'|'rate_limited'
      |'concurrency_limited'|'timeout'|'upstream_error'|'model_not_found'|'bad_request'|'circuit_open'
      |'redaction_failed'; retryAfterSec?: number; requestId?: string };
```

ai& exposes no model revision, so "record model versions" (FR-7) means the requested ID + `X-Model` + a catalog-row snapshot + `X-Request-ID`. It never means guaranteed regeneration.

**4.2.5 Redaction and request construction.**
- Only `@kw/redaction` builds the branded `RedactedBundle`.
- A final egress guard rescans the exact HTTP body for registry secrets, the ai& key, the agent token and the Neo4j password. Any hit sends nothing and writes an audit row.
- Evidence goes inside a nonce-delimited `untrusted_content` block, with limits: at most 20 events, 2 KB per string, 24 KB total. No tools are sent.
- Request parameters: `temperature 0`, `reasoning_effort: "none"` where supported, `max_completion_tokens ≈ 3000`.
- Handle `content: null`, `refusal`, and `finish_reason: length | content_filter`. Never parse `reasoning_content` as the answer.
- Send a stable non-PII `user` value. Frame requests as authorized defensive analysis (Usage Policy §2.3, §2.5; V:`ai-and-31` refutes "no policy").

**4.2.6 Citation validation (deterministic).**
1. **Schema check:** Zod against `kw.explanation.v1`. All keys are required, nullable instead of optional, `additionalProperties: false`.
2. **Reference check:** every cited ID was sent and belongs to the same run; every non-`inferred` claim cites at least one ID.
3. **Grounding check:** `observed` claims must cite independent-provenance evidence, then pass a lexical check that the path or host appears in the cited record. Grades: `supported | weak_support | unsupported | invalid_citation`.
4. **Presentation:** every AI statement renders as **"AI-generated, advisory, not evidence"**, even when all IDs resolve. AI output has no write path to finding status, policy decisions or verification results. AI safeguard proposals must be **non-broadening** (deny additions only).

**4.2.7 Failure handling.**

| Condition | Handling |
|---|---|
| 429 with `Retry-After` | Wait the max of `Retry-After` and backoff, plus jitter; at most 2 retries |
| 429 concurrency | Single-flight queue at concurrency 1 |
| 5xx, timeout, non-JSON | 1-2 retries |
| 400 on `response_format` | Switch once to `json_object` + Zod |
| Invalid output | One repair retry, then `invalid_output` |
| 401, 402, 403, 404 | No retry; typed reason shown in Settings without the key |
| 3 consecutive failures | Circuit open for 2-5 min |

Explanations are user-triggered. Detection, evidence views and status changes never wait on ai&.

**4.2.8 Caching and data handling.**
- **Cache key:** `sha256(provider, model, promptVersion, schemaVersion, params, bundleSha256)`. Citations are re-verified on cache read. The stable system prompt goes first to use ai&'s prefix cache.
- **Retention:** the binding terms retain customer content **up to 30 days** in Japan, which contradicts the marketing "Zero Data Retention" (VERIFIED [ai-27]).
- **Policy:** keep content logging off; synthetic secrets only. No key sharing (ToS §D.4), so each KW user brings their own key.

**4.2.9 Run now (key present; the probe never prints it):**

```sh
cd $REPO && set -a && . ./.env.local && set +a
node $SP/research/ai-and/probe/probe-aiand.mjs catalog
node $SP/research/ai-and/probe/probe-aiand.mjs run deepseek-ai/deepseek-v4-flash zai-org/glm-5.3-flash zai-org/glm-5.2
```

This settles the keyed catalog and tier access, the system-prompt canary, `json_object`, strict `json_schema`, latency, cost and headers. Estimated cost under $0.30 (an estimate, not a measurement).

**4.2.10 Ask Witness (Addendum A §3).** The provider method is `investigate(question, bundle: RedactedBundle, history: RedactedTurn[], o)` → `InferenceResult<InvestigationV1>`, alongside `proposeSafeguard`.
- **Schema `kw.investigation.v1`:** `summary`, `verified_facts[]{text, evidence_ids[]}`, `hypotheses[]{text, evidence_ids[]}`, `unknowns[]{text, what_would_resolve}`, `evidence_references[]`, `recommended_next_steps[]`, `recommended_safeguards[]{type, target, rationale}`. All keys required; nullable instead of optional.
- **Validation:** after the citation and grounding check (§4.2.6), each `verified_facts` entry is displayed as **verified** only if graded `supported` against independent-provenance evidence. Otherwise it is demoted to "claimed by AI, unsupported" and shown under hypotheses.
- **Retrieval:** the backend picks the finding's neighbourhood with named queries (Q1-Q6, bounded) and fetches payload excerpts from the evidence store. The model never chooses records or Cypher.
- **Question handling:** the user's question and `CLAUDE.md` content are untrusted data inside the nonce-delimited block.
- **Follow-ups:** the redacted history (capped at the last 6 turns) is re-sent; scope stays on the finding.
- **"Similar findings in other runs":** answered by a deterministic recurrence query whose results join the bundle, never by model recall.
- **Persistence:** `investigations` / `investigation_turns` (§5.7 S8); each turn links to its `ai_calls` row.
- **ai& unavailable:** the panel shows the typed reason. Evidence, graph and the deterministic "why flagged" stay available.

### 4.3 Neo4j

**4.3.1 Version (resolution X1).** Keep **`neo4j:5.26.32-community`**, the running LTS supported to Nov 2028 (VERIFIED). Pin it by digest, since tags are rebuilt in place (neo4j fact-check). Write queries in Cypher 5, with no `CYPHER 25` prefix and no `coll.*`. 2026.09.0 is pulled and was exercised in the spike (constraints and idempotent `MERGE`, spike L1748-1775). It remains a one-line fallback if a needed feature is Cypher-25-only.

**4.3.2 Driver.** `neo4j-driver` 6.2.0 (VERIFIED), as in staging `@kw/graph`:
- a single `Driver`;
- `executeQuery` with `routing: READ` for reads;
- `session.executeWrite` for idempotent batches;
- auto-commit only for DDL;
- typed errors that never throw and redact the password.

Gotchas:
- JS numbers are sent as Float, so use `neo4j.int()` or `toInteger()` (a `LIMIT $limit` fails otherwise).
- 64-bit integers go via `neo4j.int(string)` or `useBigInt`, not strings (correction from the neo4j fact-check).
- Timestamps go as ISO-`Z` strings converted with `datetime()`; never mix STRING and DATETIME.

**4.3.3 Constraints and idempotent ingestion.**
- **Community supports property-uniqueness constraints only** (VERIFIED). One id-uniqueness constraint per label; `:Event` carries it for all event sublabels. The presence of `basis` is enforced by Zod at projection time, plus an integrity query.
- **Pattern:** `UNWIND $rows AS row MERGE (n:Label {id: row.id}) SET n += row.props`, one statement per label. Labels and types come from closed sets, never from data. `MERGE` fails on a null key (22N31), so validate types first.
- **Concurrency:** read-committed isolation, and `MERGE` locks out of order. **Serialize projection** (one run at a time), sort rows by id, and retry on transient deadlock `50N05`.
- **Count checks:** compare returned counts, because a `MATCH (run)` miss silently drops rows.
- **Schema versioning:** add a schema-version node plus a `SHOW CONSTRAINTS` assertion at startup. `IF NOT EXISTS` silently skips a changed definition that keeps its name.

**4.3.4 Graph model.**
- **Nodes:** `Run`, `Task`, `Policy`, `PolicyVersion`, `Event` (sublabels `AgentEvent`/`ObservedEvent`/`DerivedEvent`), `Process`, `Resource` (canonical across runs: `res_<hash(kind,key)>`), `Finding`, `Evidence`, `Safeguard`, `VerificationRun`.
- **Relationships:** the 12 PRD relationships, plus `UNDER_POLICY`, `VERSION_OF`, `PERFORMED_BY`, `HAS_FINDING`, `HAS_EVIDENCE`, `EXECUTED_AS`.
- **Edge properties:** every edge has `basis ∈ {observed, derived, inferred}`, `rule`, `confidence` and `record_basis ∈ {reported, observed, derived, null}`. `basis` is a property, **not** part of the `MERGE` pattern, which would create parallel edges.
- **Correlations:** `derived` only with a deterministic join key (for example `tool_use_id`, or `exec_id` ancestry); otherwise `inferred`. **The tool-call → root-process hop is `inferred`** (§1.2 item 10).
- **Process identity:** Tetragon `exec_id`.
- **History:** policy versions are immutable and pinned per run. Re-analysis creates new findings and never edits old ones.

**4.3.5 Investigation queries.** The UI calls named queries only; there is no browser-supplied Cypher. Every query needs bounds and limits. Each must run on the real CE container before it is relied on (V:`neo4j-46`).

| ID | PRD question | Core pattern |
|---|---|---|
| Q1 | Which observed events support this finding? | `(f:Finding)-[s:SUPPORTED_BY]->(o:ObservedEvent)` + `s.basis` + Evidence |
| Q2 | Which agent report was compared to each observed event? | `OPTIONAL MATCH (a:AgentEvent)-[m:OBSERVED_AS]->(o)`; `a IS NULL` = unreported |
| Q3 | Which process generated this event? | `(o)-[:PERFORMED_BY]->(p)<-[:SPAWNED*0..32]-(anc)` |
| Q4 | Which policy was in effect? | `(run)-[:UNDER_POLICY]->(pv:PolicyVersion)-[:VERSION_OF]->(pol)` |
| Q5 | Which safeguard came from this incident? | `(f)-[:PROPOSED_AS]->(s:Safeguard)` |
| Q6 | Did a verification run reproduce or prevent it? | `(f)-[:PROPOSED_AS]->()-[:VERIFIED_BY]->(v)-[:EXECUTED_AS]->(vr:Run)` + same-resource events; `inconclusive` when coverage is incomplete |

**The investigation a flat list cannot easily answer** (PRD §7.4; demo step 6):

```cypher
// The agent reported a Bash tool call. Which descendant processes touched resources with no agent report,
// and which hops are observed vs inferred?
MATCH (tc:AgentEvent {id: $toolCallId})-[link:SPAWNED]->(root:Process)      // inferred: time + ancestry
MATCH path = (root)-[:SPAWNED*0..32]->(p:Process)                            // observed: Tetragon exec chain
MATCH (o:ObservedEvent)-[:PERFORMED_BY]->(p)
WHERE NOT EXISTS { MATCH (:AgentEvent)-[:OBSERVED_AS]->(o) }
OPTIONAL MATCH (o)-[:TARGETS]->(res:Resource)
RETURN o.id AS eventId, o.event_type AS type, o.ts AS ts, res.id AS resource, p.id AS processId,
       link.basis AS toolToRootBasis, [r IN relationships(path) | r.basis] AS hopBases
ORDER BY ts LIMIT 200
```

A flat list needs a recursive parent-pid self-join that copes with pid reuse, an anti-join against reported calls, and per-hop provenance. The graph does it in one bounded pattern. Demo line: "the agent said it ran `npm test`; a grandchild process opened the secret; every process hop is kernel-observed, the tool-to-process link is inferred, and no report covers the open." A companion query, needing no eBPF: finding → safeguard → verification run → recurrence.

**4.3.6 Visualization.** Cytoscape.js 3.34.4 (MIT) + `cytoscape-dagre`, behind a `GraphRenderer` interface:
- `observed` edges solid, `derived` dashed, `inferred` dotted with a confidence label;
- `record_basis = reported` in its own colour;
- tapping a node opens the inspector and jumps to the timeline.

Not NVL: its licence excludes self-hosted Community (VERIFIED reading [neo-41]; not legal advice). A table view is the fallback.

**4.3.7 Source of truth.** **SQLite is authoritative; Neo4j is a rebuildable projection.** The reasons:
- Community cannot express append-only or lifecycle constraints.
- Detection must work with Neo4j down.
- CE keeps no audit log and every user is an admin.

The projection is synchronous and per run after analysis (`RunBundle` → idempotent `MERGE`). `kw graph rebuild` means wipe, create constraints, re-project every run. `kw graph check` compares ID sets per label. Neo4j listens on host loopback only, and the agent's network has no route to it (EMPIRICAL P10-P12). Self-test T2: connect to `host.docker.internal:7697` from the agent, which must fail (P11). Consider not publishing 7474 (admin console) for the demo.

---

## 5. System architecture and data model

### 5.1 Components and dependency rules

```
packages/schema               zod only                                    (BUILT)
packages/analysis             schema, zod. PURE: no I/O, clock, net       (STAGING)
packages/redaction            no deps                                      (STAGING)
packages/inference            schema, redaction                            (STAGING)
packages/graph                schema, neo4j-driver                         (STAGING)
packages/adapter-claude-code  schema                                       (STAGING)
apps/server                   composition root; the only writer of SQLite, evidence store and Neo4j
  src/runner/                 run lifecycle, docker CLI/compose, stdout capture, bundle    (UNOWNED -> stream 2)
  src/observers/              Tetragon, proxy, manifest normalizers                         (UNOWNED -> stream 4)
  src/evidence/               CAS blobs, manifest chain, verifyRun                          (UNOWNED -> stream 2)
  src/safeguards/             propose/approve/apply/verify                                  (UNOWNED -> stream 9)
  src/ingest/, src/repo/, src/db/                                                           (BUILT; extend)
apps/web                      imports @kw/schema ONLY                                       (BUILT)
docker/                       agent, egress-proxy, compose.*, tetragon policies
```

- **`@kw/analysis` never imports inference, graph, db, fs, net or clock.** That makes "AI is never the authority" and "detection works with Neo4j or ai& down" structural. Enforce it with a 10-line grep test.
- `apps/web` imports only `@kw/schema` (BUILT; 18 of 18 imports).
- Collectors, the adapter and inference return values; only the server persists.

**Degradation matrix**

| Down | Collection | Detection | Evidence view | Graph panel | AI panel | Required UI text |
|---|---|---|---|---|---|---|
| Neo4j | works | works | works | "Graph unavailable; run detail and evidence still complete" | works | Settings: Neo4j `error` |
| ai& | works | works | works | works | typed reason | never a blank panel |
| Tetragon | reported, proxy, snapshot | rules needing process or file evidence → `uncertain_correlation` or skipped | works | works | works | coverage `partial`; process attribution "unavailable" |
| Egress proxy | agent loses all network (fail-closed) | works | works | works | works | run `failed`; gap recorded |
| Docker | live runs disabled | fixtures browsable | works | works | works | "Live runs unavailable: Docker not reachable" |

### 5.2 Data flow

```
 COLLECT (during run)        EVIDENCE STORE (host)        NORMALIZE (post-run)        SQLite (record)
 agent stdout (stream-json) ─┐                             adapter (basis=reported)   runs, policy_versions
 hook spool  (/kw-hooks)  ───┤ raw bytes → sha256 →        observers (basis=observed)  events UNIQUE(run,basis,
 tinyproxy log            ───┼► blobs/sha256/.. ► manifest ► makeEventId(...)        ►   source,native_key)
 tetragon getevents JSON  ───┤   (0444, CAS)      entry     LiveRunBundle → importer   evidence, coverage_reports
 workspace manifests P0/P1 ──┤                    (prev,hash)  (INSERT OR IGNORE +       ingest issues
 docker inspect / lifecycle ─┘                                  content-hash compare)
        UI ◄─ REST /api ◄─ repos ◄─ findings + status history ◄─ ANALYZE (pure, once, after close)
         ▲                          ▲
         └─ graph panel ◄─ named queries ◄─ Neo4j ◄─ PROJECT (sync, per run, MERGE on id)
            AI panel ◄─ ai_calls ◄─ @kw/inference ◄─ @kw/redaction (fail-closed RedactedBundle)
```

Rules:
1. **Raw first.** Bytes reach the store before parsing. Unparseable records are kept and counted into coverage `errors`.
2. **Analysis runs once, after the run closes.** The UI never shows findings from half-collected data.
3. **Projection is synchronous, serialized and per run.**
4. **AI output goes only to `ai_calls`.**

### 5.3 Run lifecycle (supervisor sequence)

`RunStatus` stays as BUILT: `pending | running | completed | failed | aborted`. Finer phases are recorded as `collector_status` events from `sandbox_runtime` plus manifest entries; no enum churn. "Completed" means collection and analysis finished, never "safe".

1. **Lock.** One live run at a time: `compose.agent.yml` hard-codes `container_name` and network names.
2. **Create.** Mint `run_id` and a session UUID. Snapshot the policy as canonical JSON → immutable `policy_versions` row with `content_sha256`. Record the task, repository template and revision, and the Docker Desktop, kernel, Tetragon, Claude Code and image digests in `run.open`.
3. **Prepare the workspace.** Populate the per-run volume from `fixtures/repos/invoice-kit` plus scenario setup (as root; per-run canary `KW-CANARY-<uuid>`; helper hash recorded). Take pre-manifest **P0** (§5.5).
4. **Generate per-run managed settings** into `~/.kernel-witness/runs/<run>/claude-managed/` (0644): the complete allow list, policy denies, `WebSearch`/`WebFetch`/`Task` deny, managed-only keys, applied safeguards. Run the `docker inspect` mount guard (read-only binds only from that directory; `no-new-privileges` true; no socket).
5. **Start the proxy, then the agent in a held state.** The entrypoint waits for a go-signal before `exec claude` (P3).
6. **Attach the observer.** Read the agent's pid-ns inode. Load the per-run observe policy (watched prefixes) and, for treatment runs, the LSM restriction scoped to that inode. Start the `getevents` capture to the host.
7. **Self-test, then release.**
   - The entrypoint opens `/workspace/.kw/selftest`, and the supervisor waits until Tetragon reports it.
   - `unshare -p` must fail (P10).
   - A direct connect must fail (P2/P11).
   - **If the observer is not ready:** scenarios with `requireObserver` (all verification runs that credit SG-C) are refused. Others start with a recorded whole-run gap for `process_execution`/`file_access` (D5).
8. **Capture.** Host-side `docker logs --follow --timestamps`, which can be replayed after a supervisor crash; stdin `</dev/null`.
9. **Stop** on the first of: stream-json `result` + grace period, container exit, timeout, developer abort. **Never stop on the agent-reported `Stop` hook.** Activity after `result` is flagged `post_report_activity`.
10. **Collect.** `docker pause` → post-manifest **P1** → copy out the hook spool, transcript and proxy log (P12) → drain Tetragon and read loss counters → kill and remove the agent (keep the volume only if `keepWorkspace`).
11. **Legit check.** A fresh `--network none` container runs pristine held-out `node --test test/__kw__/` against `src/**` copied from the post-run workspace. It never uses the agent's claim.
12. **Unload** the run's Tetragon policies.
13. **Close evidence.** Append `run.close`, write `seal.json` (`O_EXCL`), run `verifyRun(quick)`.
14. **Bundle and import.** Write `LiveRunBundle` (`FixtureRunFile` shape, `is_fixture:false`, plus `raw_dir` and manifest) → `importLiveBundle` (refuses `is_fixture:true`) → `analyzeRun()` → persist findings with their initial `new` history row (actor `system`) in one transaction → `coverage_status` → project to Neo4j (best-effort).

### 5.4 Failure handling: a collector failure becomes a coverage gap

| Failure | Handling | Recorded as |
|---|---|---|
| Observer never attaches | refuse (`requireObserver`) or start with a gap | `kernel_tracer` inactive + error; categories unavailable; coverage at most `partial` |
| Observer dies mid-run | run continues | gap `[last_ts, end]`, `collector_exit_<code>` |
| Tetragon loss counters > 0 or not captured | keep | gap with count, or "loss not measured"; `complete` impossible |
| Proxy dies | agent loses network (fail-closed) | `network` gap; run `failed` |
| Hook spool missing or corrupt | keep raw; count parse errors | reported-side gap; stream-json still covers FR-3 |
| No `result` line (SIGKILL/OOM/crash) | proceed to collect | `agent_reported_actions` partial; `final_state_complete=false` |
| Supervisor crash | on boot: back-fill stdout from `docker logs`, collect, mark `aborted` | gap `supervisor_down` |
| Event ID conflict (same ID, different content) | keep the first, never overwrite | ingest issue `conflict` in coverage `errors` (C9) |
| Neo4j down | skip projection; retry on demand | graph status "behind" |
| ai& failure | typed error in UI | `ai_calls` row with `error_kind` |

### 5.5 Workspace change record

- **Why a manifest:** `docker diff` does not list writes inside a named volume (spike L1705-1727, EMPIRICAL).
- **How it is taken:** a short-lived trusted container (`--network none`, volume read-only) walks the tree with `lstat` + sha256 and emits `{path, type, mode, size, sha256, link_target}` for every file, **including ignored files and `.git/**`**. HEAD and refs are read as file contents, with no git execution. P0 vs P1 → `repo_change` events (`git_observer`).
- **Display diffs only:** these may use git, but only with a KW-owned `GIT_DIR`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, `core.fsmonitor=` and `core.hooksPath=/dev/null`. **Never run git as a trusted process over the agent-written `.git`.**

### 5.6 Normalized event schema, native keys, duplicates

**The event record is BUILT** (`entities.ts` `Event`):
- `id = evt_ + sha256(run_id ␟ basis ␟ source ␟ source_native_key)`, where ␟ is U+001F.
- `basis` is fixed by source through `EVENT_SOURCE_BASIS`; the fixture validator rejects a mismatch.
- `event_type`: 21 flat types.
- One `timestamp` plus `source_sequence`.
- Nullable process and tool fields, never guessed.
- `outcome`: `attempted | allowed | denied | blocked | succeeded | failed | unknown`.
- `evidence_id`, `attribution_confidence`.
- `collection_status`, `unavailable_fields[]`, `limitations[]` (what the event does *not* prove).
- `is_fixture`.

**Outcome rules:**
- `blocked` requires an **attesting enforcement record**: a Tetragon `process_lsm` Override, a proxy 403 line, or a KW rule ID. A bare EACCES/EPERM is `failed`, with the errno in `details`. Because #5781 makes every Override return EPERM, the pairing comes from the Tetragon event, never from the errno.
- Sources that disagree raise an `outcome_mismatch` signal; this is never resolved inside the event.

**Native keys (stable across re-ingest):**

| Source | Native key | Note |
|---|---|---|
| `claude_code_stream_json` | `sj:{session_id}:{uuid}:{block_index}` | top-level line `uuid` (UNVERIFIED field name until the adapter's contract test on `smoke/agent-stdout.stream.jsonl`) |
| stream-json result denials | `sj-result:{session_id}:denial:{tool_use_id}` | authoritative denial list |
| `claude_code_hooks` | `pos:{evidence_id}:{line_no}` | spool is forgeable; position in the host-copied, hashed file is collision-free; grouping by `tool_use_id` happens in analysis |
| `claude_code_transcript` | `tr:{session_id}:{uuid}[:{block}]` | lowest precedence |
| `kernel_tracer` | `pos:{evidence_id}:{line_no}` of the host capture | **X7**: overlay pairs are 25-45 µs apart, so they keep distinct IDs and are grouped by a labelled `corroboration` step |
| `network_proxy` | `pos:{evidence_id}:{line_no}` | no connection sequence in tinyproxy |
| `git_observer` | `{P0_sha}..{P1_sha}:{path}` | manifest diff |
| `sandbox_runtime` | `{transition}:{n}` / `gap:{source}:{n}` | lifecycle and gaps |
| `kw_correlator` / `kw_policy_engine` | `{rule_id}@{major}:{sorted input ids}` | derived only |
| any record yielding several events | append `#{ordinal}` | otherwise later events are lost |

**Three kinds of duplicate:**
1. **Re-delivery** of the same record: same ID → `INSERT OR IGNORE` (BUILT; a second fixture import inserted nothing).
2. **One action seen on several agent channels:** all kept with distinct provenance, grouped by `tool_use_id`. Display precedence is stream-json > hooks > transcript, shown as "1 logical action, 3 records".
3. **A reported action and its observed effect:** **never merged**; linked by `EventCorrelation{match, confidence}` (derived).

**Time:** `details.time_basis ∈ {source, capture, ingest}`. Hooks have no native timestamp, and their capture time is agent-side. Correlation prefers `tool_use_id` and `exec_id` lineage over time windows.

### 5.7 Migration 002 and schema additions (freeze by 11:15; additive, so existing fixtures and tests stay valid)

| # | Change | Why |
|---|---|---|
| S1 | `claude_code_stream_json` in `EventSource` (basis `reported`) | Primary reported channel |
| S2 | `events.details` JSON + Zod `EventDetails`: `argv, cwd, errno, exit_code, signal, access_mode, resolved_path, enforcement_rule_id, exec_id, parent_exec_id, process_start_time, host, port, change_kind, before_sha256, after_sha256, agent_id, parent_tool_use_id, time_basis, corroboration, unavailable_reasons` | STAGING analysis already passes these out of band; analysis must be reproducible from SQLite alone |
| S3 | Append-only triggers on `events`, `evidence`, `event_correlations`, `finding_events`, `finding_evidence`, `coverage_reports`; findings no-delete + core columns immutable | PRD §7.2 |
| S4 | `safeguards.content_sha256`, `safeguards.proposed_by ∈ {developer, ai_provider}`, `safeguard_status_history` (append-only) | Approval bound to exact content; changes recorded (PRD §9) |
| S5 | **`ai_calls`**: `id, finding_id, kind, provider, requested_model, served_model, request_id, prompt_version, schema_version, bundle_sha256, cache_key, cache_hit, status, error_kind, latency_ms, usage_json, cost, cited_ids_json, grounding_json, output_ref, redaction_ruleset_version, created_at` | FR-7 reproducibility and failure metrics (resolution X5) |
| S6 | `audit_events` (`prev_hash`, `hash`, append-only): policy, safeguard, status, purge, override actions | PRD §9 "record policy and safeguard changes" (absorbs `safeguard_audit`) |
| S7 (Zod only) | `LiveRunBundle` (`bundle.ts`); `SafeguardType.environment_restriction` (no CHECK on the column, so no SQL); `CorrelationMatch` mapping helper (exact/probable → `matched`, ambiguous → `uncertain`, unmatched → `reported_only`/`observed_only`; finer state in `detail`); optional `CoverageReport.gaps`/`enforcement` | Contract for parallel builders |
| — | **No `profile_versions` table**: applying a safeguard writes a new immutable `policy_versions` row that future runs pin (resolution X6) | Fewer tables |

### 5.8 State machines

**Finding** (BUILT transitions, server-enforced in an IMMEDIATE transaction):

| From | To |
|---|---|
| new | under_review, confirmed, dismissed, unresolved |
| under_review | confirmed, dismissed, unresolved |
| unresolved | under_review, confirmed, dismissed |
| confirmed | resolved, under_review |
| resolved | under_review |
| dismissed | under_review |

Notes are required for `dismissed` and `resolved`. History is append-only, and findings are never deleted. The engine emits only `new`. New API guards (about 20 minutes):
- `→ confirmed`: only by a `user` actor, with at least one related `observed` event or a note saying why reported-only evidence suffices. AI output never counts. Never automatic (D16).
- `→ resolved`: requires a completed verification run with `verified_for_tested_scenario` for this finding (default, D15), or an audited override citing later-run evidence IDs.
- `recurrence_of_finding_id` is set when the recurrence key (repository, category, policy rule, resource) appears in a later run. The UI shows "potential regression" when the earlier finding is resolved or has a verified safeguard. A live finding is never linked to a fixture finding.

**Safeguard** (BUILT columns `approval_status`, `application_status`, `verification_status`; one `transitionSafeguard()` writes history + audit in one transaction):

```
proposed ──approve(content_sha256, user)──► approved ──apply──► applied ──► test_pending ──► verified_for_tested_scenario
   └─► rejected                               └─► application_failed (retry)       ├► failed_verification
                                   applied / verified / failed ──► reverted        └► verification_inconclusive
```

| Step | Rule |
|---|---|
| **Propose** | Finding `confirmed` with at least one observed event (safeguards design E1). Templates SG-A/SG-B/SG-C (§6.10). AI proposals only after validation, and non-broadening. Instructions are at most 2,000 characters. |
| **Approve** | `user` only. The body echoes `content_sha256`; mismatch → 409. |
| **Apply** | A separate request. Writes the managed tier for future KW runs (a drop-in deny, managed `CLAUDE.md`, or a Tetragon restriction in the new `policy_versions` row). `application_status` comes from read-back: file hash, uid-1000 readability, next run's stderr. UI copy: "Applied to Kernel Witness supervised runs". |
| **Strength badge** | Always shown (§4.1.7). |

**Verification run** (BUILT `status`, `result`, three nullable booleans). It runs as an ordinary supervised run (`run_id`). The verdict is a pure function in `@kw/analysis`:
- **`prohibited_behavior_attempted`**: a matching reported call or denial, or an observed event. It is false only if the required capabilities were active with no gap; otherwise null.
- **Blocked basis:**
  - "blocked (independently observed)" needs a Tetragon Override or proxy 403;
  - "blocked (agent-runtime denial; no contrary independent evidence)" needs a rule denial plus healthy file-open coverage;
  - false if an observed `succeeded` exists on the target.
- **`legitimate_behavior_worked`**: the held-out check (step 11) exits 0. Never the agent's claim.
- **Verdicts:**
  - `failed_verification` if the prohibited effect is observed **or** the legit check fails (fixture 10);
  - `verified_for_tested_scenario` only if there is no prohibited effect, the legit check passes, and coverage is OK;
  - else `verification_inconclusive`, including "not exercised" when the control did not reproduce.
- **Copy:** "Verified for scenario ‹name› in environment ‹env›, N trial(s), basis ‹…›". It never generalizes.

### 5.9 Evidence integrity

```
~/.kernel-witness/            0700; server refuses to start if group/world-accessible
  blobs/sha256/ab/<64hex>     raw bytes: tmp -> fsync -> rename -> chmod 0444 (content-addressed)
  runs/<run>/manifest.ndjson  {v, runId, seq, kind, source, basis, receivedAt, blob:{sha256,size}, prev, hash}
                              hash = sha256(canonical(entry without hash)); prev = previous hash ('0'*64 at seq 0)
  runs/<run>/seal.json        once (O_EXCL): {runId, entryCount, headHash, sealedAt, endReason}
  runs/<run>/claude-managed/  per-run managed settings (mounted read-only)
```

- **Kinds:** `run.open`, `segment`, `gap`, `mount_check`, `selftest`, `run.close`.
- **`verifyRun()`:** `seq` contiguous, `prev` chain intact, hashes recompute, blobs exist and re-hash. A missing blob counts as "purged" only if the audit log records the purge. States: `verified | verified_with_purged_blobs | not_sealed | broken`.
- **Linking:** `Evidence.integrity_metadata` holds the blob hash and manifest seq; `source_reference` holds the locator (`raw/stream.jsonl#L42`).
- **Dropped:** the ed25519 signature, key rotation and global checkpoints. The key would sit next to the data, and the agent has no path to the store.
- **Cut fallback (X4):** a flat `MANIFEST.sha256`.
- **UI badge:** "Unmodified since recording", never "Integrity verified".

| Guarantees (tamper-evidence) | Does **not** guarantee |
|---|---|
| Any later edit, deletion, insertion or reordering of manifest entries or blobs is detected | Protection against the host user, host root or VM root (R1) |
| The agent has no write path (no mount; no route to the API or Neo4j) | Completeness or truth of what collectors saw; honesty of reported content |
| Gaps and drops are explicit entries | Trusted time (supervisor clock) |
| DB-to-evidence drift is detectable | Confidentiality at rest (plaintext; FileVault + 0700) |
| | That SQLite history is immutable (a host user can drop triggers) |

**Phrasing that must not appear:** "settings tampering is blocked" (only its effect is neutralized), "proves no secret leaves", "every network attempt is logged" (direct connects fail in-kernel and reach no proxy log), "out-of-container effects are impossible".

### 5.10 Redaction and retention

**Redaction.**
- **Requests to ai&:** mandatory and fail-closed (§4.2.5).
- **UI excerpts:** `Evidence.excerpt` is by contract a redacted excerpt; raw bytes stay in blobs; there is no reveal UI.
- **Neo4j properties and logs:** redacted copies only.
- **Raw blobs:** never modified.
- **Detectors** (STAGING): a synthetic-secret registry with encoded variants, format rules (AWS, GitHub, `sk-ant-`, `sk-`, Slack, Stripe, private keys, JWT, URL credentials, auth headers), dotenv parsing, `isSecretishKey`, entropy.
- **Markers:** `[[REDACTED:<kind>:<fp8>]]`, where `fp8` is an HMAC with a per-run salt.
- **Two required fixes:**
  1. Trigger dotenv parsing when the producing tool call references a sensitive path.
  2. Measure recall on a **holdout** set of synthetic secrets that are *not* in the registry.

**Retention** (`docs/RETENTION.md`; manual purge script, no automatic job):

| Data | Default |
|---|---|
| Raw blobs | 30 days after run end. Pinned while any finding is outside `{dismissed, resolved}`, or a safeguard or verification run references it |
| Snapshot file contents | 7 days (manifests kept) |
| Runs, events (redacted fields), findings, history, safeguards, verification runs, manifests, seals, audit log | Indefinite (local) |
| Docker log-driver copies | Removed with `docker rm`; capped with `--log-opt max-size` |
| Agent container and volume | Removed at run end unless `keepWorkspace` |
| ai& side | Up to 30 days in Japan per the binding terms (VERIFIED [ai-27]); not controlled by KW |

**Purge semantics:** a purge deletes bytes only and appends an audit row. `verifyRun` then reports `verified_with_purged_blobs`. "Delete run" blanks content fields and keeps IDs and history.

### 5.11 API surface

**BUILT** (`API_CONTRACT`, Zod in and out, 127.0.0.1, CORS `127.0.0.1:4601`/`localhost:4601`):
- `GET /api/health`, `/api/overview`;
- `GET /api/runs`, `/api/runs/:id`, `/api/runs/:id/events`, `/api/runs/:id/findings`;
- `GET /api/findings`, `/api/findings/:id`, and `POST /api/findings/:id/status`;
- `GET /api/safeguards`, `/api/evidence/:id`, `/api/settings/status` (never secret values).

**To add** (contract entry first, by the integrator):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/runs` | Start a supervised run `{scenario_id, safeguard_ids?}` (CLI `pnpm kw run` is the fallback) |
| POST | `/api/runs/:id/stop` | Developer abort |
| POST | `/api/runs/:id/analyze` | Re-analysis (new findings; never edits old ones) |
| GET | `/api/findings/:id/graph?question=` | Focused subgraph + Cypher text + truncation flag; node `id` = SQLite PK |
| POST | `/api/findings/:id/explanations` | ai& explanation (cached by bundle hash) |
| POST | `/api/findings/:id/safeguards` | Propose from a template (or validated AI) |
| POST | `/api/safeguards/:id/approve` | `{content_sha256}`; 409 on mismatch |
| POST | `/api/safeguards/:id/apply` | Writes the managed tier; read-back sets status |
| POST | `/api/safeguards/:id/verifications` | Start a verification run |
| GET | `/api/verification-runs/:id` | Status, verdict, evidence IDs |

**Mutation hardening** (about 30 minutes): a `Host` header allowlist; an `X-KW-Token` per-boot token embedded in the served HTML and required on every POST; JSON-only bodies. Binding to 127.0.0.1 is not by itself a boundary on Docker Desktop, because bridge containers may reach host loopback through `host.docker.internal` (P11). The agent sits only on the internal network.

### 5.12 Fixture and live separation

**BUILT:**
- `is_fixture` on every table;
- `FixtureRunFile` requires `is_fixture: true` on every record;
- `run_fx_*` IDs;
- fixtures enter only via `pnpm seed:fixtures`;
- a `fixture=include|exclude|only` filter;
- `DataMode`;
- UI badges.

**Changes:**
1. Overview defaults to `exclude` once live runs exist, with a toggle.
2. Run the live demo on `KW_DB_PATH=data/kw-live.db`, which then holds zero fixture rows by construction.
3. Live import hard-codes `is_fixture=false` and refuses `true`.
4. Status changes inherit `is_fixture`.
5. Keep fx-01..05 as UI fixtures. Analysis tests use small raw golden inputs plus **recorded** live runs labelled "recorded-live, 2026-10-17, Claude Code 2.1.302". Nothing in validation reports is hand-written.

---

## 6. Implementation plan, validation, demo (PRD §14 item 4)

### 6.1 Time budget

The designs sized the work at about 208 engineer-hours (about 125 for the demo subset). We have about 4 hours of build time. The plan fits about **36 agent-hours into 11:00-14:50 using 10-12 parallel agents** by cutting depth, never honesty.

| Window (JST) | Activity |
|---|---|
| 10:55-11:15 | Review of this document; decisions D1-D4 |
| 11:00-14:50 | Build slices V0-V6 |
| 14:50 | Code freeze |
| 14:50-15:30 | Two rehearsals + screen recording (fallback) |
| 15:30-15:45 | Submission (15:45 at the latest) |

### 6.2 Ways to go faster (answers "are there any other ways to fasten the process?")

Ranked by time saved. Each item names what it removes from the critical path.

1. **Plan to 16:00, not to the designs.** Build only what the PRD §13 demo and the §10 checkboxes need; everything else is on the cut list (§6.12).
2. **Start the unowned evidence producers now.** The runner/supervisor, the Tetragon observer and the snapshotter are the critical path, and nobody owns them. The observer agent can reuse the spike's policy files directly (`$SP/research/observation-spike/tetragon/kw-canary-lsm-override-scoped.yaml` and the observe policies).
3. **Auth is already fixed, so record a real scenario run now and replay it** ("record once, replay many"). One captured run of `scn.legit` and `scn.direct` lets the adapter, analysis, graph and ai& streams build and test against real bytes, with no model spend and no Docker wait per iteration.
4. **Freeze one contract at 11:15**: migration 002, `LiveRunBundle`, `scenario.json`, and the API contract entries. Then work in disjoint directories, with one integrator merging at :00 and :30. Late enum churn is the biggest coordination cost.
5. **Batch post-run ingest through the existing, tested importer** (`LiveRunBundle`). This drops live streaming, SSE, crash reattachment and per-event persistence (saves about 10 agent-hours).
6. **Make the demo deterministic.** `scn.subprocess` and `scn.probe` do not depend on model choices. Model-dependent arms are recorded early and labelled. The model reported accurately in every probe run, so misbehaviour must be seeded.
7. **One observer, one enforcement mechanism.** Tetragon for both observation and kernel enforcement. Don't build the strace fallback, and don't use DAC (invisible to the traced hooks).
8. **Run the ai& probe now.** The key is present, and it takes minutes. It settles the model and structured-output mode before V4 starts.
9. **Run probes P2-P6 and P8-P12 in parallel now.** They need no model calls and settle the remaining unknowns in minutes each.
10. **Keep the running Neo4j 5.26.32.** No image swap and no query back-porting; staging code already targets it.
11. **Drive Docker with the CLI** (`docker compose run`, `docker logs`, `docker cp`), not a new library.
12. **Dependency-free demo repo** (`invoice-kit` in plain ESM + `node --test`). No registry access through the allowlist and no image rebuild.
13. **Cut channels:** stream-json + hooks + `permission_denials` only. Defer OTel, HTTP hooks, transcript parsing beyond copy-out, the outbox projector, the gate-injected key and the signature. Show deferred items as "not implemented" via `ComponentStatus`, never as stubs.
14. **Merge staging packages as each one typechecks; retire staging at 12:30.** The 22 server tests catch integration breaks early, and two trees don't drift in the critical window.
15. **Gate only on live smokes, not on reviews.** Do not wait for the correlation-engine or domain-schema critiques or the landscape fact-check. Fold them in only if they land before 13:00.
16. **One live run at a time under a lock.** Parametrizing container and network names is not worth the time.
17. **Three 5-minute user checkpoints** (11:15, 13:15, 14:50). Agents never block on you between them.
18. **Record the matrix early** (13:50-14:35) while UI polish continues.
19. *(Optional, only after 13:15.)* Replace tinyproxy with a small Node CONNECT proxy that logs client port and byte counts. This gives an exact process join with Tetragon `tcp_connect` instead of time correlation. It improves attribution; it does not save time.

### 6.3 Sprint decisions that deviate from the designs

| # | Decision | Replaces | What we give up (goes in `LIMITATIONS.md`) |
|---|---|---|---|
| D1 | Batch post-run ingest via `LiveRunBundle` | live tail, SSE, reattach | No live timeline; an interrupted run is `aborted` with partial data |
| D2 | Environment safeguard = Tetragon LSM `file_open` Override on the restricted prefix, loaded only for treatment runs | DAC chown | EPERM, not EACCES; root in the VM out of scope; inside KW runs only |
| D3 | Observation = Tetragon exec/exit + `security_file_open` observe policy on `/workspace/` prefixes, via `tetra getevents -o json` to a host file | eBPF ladder, bpftrace, strace | Overlay duplicates handled as corroboration; open ≠ read |
| D4 | Hooks = command hook into a volume spool, labelled reported | HTTP hook sink | Agent can write the spool (stated in coverage) |
| D5 | Keep `$REPO` layout; add the five packages; runner in `apps/server/src/runner/` | 17-package layout | none |
| D6 | Demo repo `fixtures/repos/invoice-kit`, plain ESM + `node --test` | vitest repo | Less realistic toolchain |
| D7 | Scenario helper opens a KW marker, then `open()`s the secret unconditionally, then `curl -s -m 3 https://telemetry.kw-sink.test/` via `HTTPS_PROXY`, swallowing errors | vitest global setup | none (`.test` never resolves; 403 is logged) |
| D8 | Legit check = held-out tests in a fresh `--network none` container on copied `src/**` | checker on the agent's workspace | none |
| D9 | Credit a Claude Code block to a safeguard only for rule denials (`toolDenialKind: permission-rule`) | single layer | Some agent-layer blocks show "layer unidentified" |
| D10 | Managed policy generated per run, 0644, readability-checked; stderr parsed for dropped or unreadable notices | one-time apply check | none |
| D11 | Neo4j: synchronous projection after analysis + `kw graph rebuild`; three named queries in Cypher 5 | outbox + 6 queries | Q2, Q4, Q5 answered by SQL views if time runs out |
| D12 | Map analysis correlation states onto `CorrelationMatch` | schema change | Finer states only in `detail` JSON |
| D13 | `SafeguardType.environment_restriction`, label "Environment restriction (enforced by the KW run environment; inside KW runs only)" | — | none |

### 6.4 Vertical slices

Agent-hours (ah) are rough estimates. AC IDs follow PRD §10 order (Appendix A).

| Slice | Window | ah | Deliverables | Acceptance |
|---|---|---|---|---|
| **V0 contract + smokes** (critical) | 11:00-11:30 | 3 | `git init` + baseline commit (D2); `bundle.ts`; migration 002 + S7; `scenarios/{scn.legit, scn.direct, scn.subprocess, scn.probe}.json`; `invoice-kit`; managed-policy and entrypoint fixes (§4.1.4). Smokes: **S-CC** (scenario run with a deny probe; P1), **S-TG** (privileged sidecar, observe + LSM policies, `scn.probe` without/with LSM; P2-P4, P10), **S-AI** (keyed catalog + one strict explanation call) | Each smoke writes pass/fail + captured output to `$REPO/docs/spikes/` |
| **V1 live run → persisted run** (critical) | 11:00-12:45 | 7 | runner (§5.3), adapter normalizers, observer normalizers (Tetragon, proxy, manifest), coverage computation, `importLiveBundle`, evidence store | AC1 session_id on Run; AC2 basis by source; AC3 persisted; AC4 re-import adds 0 rows; AC5 killing Tetragon mid-run gives `partial` + error. Demo check: `scn.legit` shows matched lanes, no FIXTURE chip |
| **V2 discrepancy engine** | fixtures 11:00-12:30; live 12:45-13:15 | 6 | Rules D1 unreported observed, D2 outcome mismatch, D3 change mismatch, D4 permission violation (`blocked_by` only from an enforcement record or rule denial), D5 uncertain; independent severity/confidence rubrics; replay fixtures fx-06..11 | AC6-AC10; live: `scn.direct` P0 → F-1 `permission_violation` succeeded/high; `scn.subprocess` → D1 + D4 + proxy deny |
| **V3 Neo4j graph** | 11:00-12:30; merge 12:45 | 4 | constraints; projection; Q1, Q3 (process ancestry), Q5/Q6 lineage; graph route; Cytoscape panel + table view + "Jump to timeline" | AC12 ≥3 hops on live `scn.subprocess`; AC13 policy-v2 re-analysis keeps v1 edges; AC29 same event ID; project twice → same counts; Neo4j stopped → "unavailable" |
| **V4 ai&** | 11:00-12:30; merge 12:45 | 3.5 | provider (§4.2), redaction, citation validator, cache, `ai_calls`, explanations route, AI panel | AC15-AC19 (unknown ID → "unsupported"; stubbed 401/429/503/timeout keeps the app working; no `KW-CANARY-` in the outbound body) |
| **V5 safeguards + verification** (critical) | API/UI on fixtures 11:15-13:15; runner integration 13:15-13:50 | 7 | SG-A/B/C templates; hash-bound approve; apply with read-back; verify through the V1 runner + pure verdict; "Resolve with evidence ver_…"; wizard, Safeguard Detail, two-axis Verification Detail | AC20-AC24; FX8-FX10 on replay and live |
| **V6 recorded matrix + harness + docs** | 13:50-14:35 | 4.5 | 10 recorded runs (§6.10 order); `pnpm kw validate`; `docs/COVERAGE.md`, `LIMITATIONS.md`, `RETENTION.md`; `scripts/demo-check.ts` every 30 min from 13:30 | A report file exists before any number is quoted; demo-check green twice |
| **V7 freeze, rehearse, submit** | 14:50-16:00 | 1 | two rehearsals, recording, README "real / recorded / fixture" table | submitted by 15:45 |

### 6.5 Parallel streams and file ownership

| # | Stream | Owns (write access) | ah |
|---|---|---|---|
| 1 | Integrator | `packages/schema/**`, `apps/server/src/{routes.ts,app.ts}`, `apps/server/migrations/**`, root `package.json`, lockfile, merges | 3 |
| 2 | Runner (supervisor + evidence store) | `apps/server/src/{runner,evidence}/**`, `docker/**`, `scripts/agent-smoke*` | 3.5 |
| 3 | Adapter | `packages/adapter-claude-code/**` | 1.5 |
| 4 | Observer | `apps/server/src/observers/**`, `docker/tetragon/**` | 2.5 |
| 5 | Analysis | `packages/analysis/**` | 4 |
| 6 | Fixtures + harness | `fixtures/**` (except repos), `scripts/validate.ts`, `reports/**` | 3.5 |
| 7 | Graph | `packages/graph/**`, `apps/server/src/routes/graph.ts` | 2 |
| 8 | Inference | `packages/{inference,redaction}/**`, `apps/server/src/routes/explanations.ts` | 2.5 |
| 9 | Safeguards API + verifier | `apps/server/src/safeguards/**`, `routes/safeguards.ts` | 4.5 |
| 10 | Web A | `apps/web/src/pages/{Safeguard*,Verification*}`, `components/safeguard/**` | 2.5 |
| 11 | Web B | `apps/web/src/components/{graph,ai}/**`, Finding Detail tabs | 3 |
| 12 | Scenarios, demo, docs | `fixtures/repos/invoice-kit/**`, `scenarios/**`, `docs/**` (except this file's sections owned by review), `scripts/demo-check.ts` | 3 |

**Rules:**
- New routes go in `routes/<feature>.ts`, registered by a one-line call from the integrator.
- Cross-directory needs go as a note in `docs/contracts/`.
- Only the runner starts agent containers, under the lock.
- No agent prints `.env.local`, the token file, `.env.neo4j*` or `docker compose config` output.

### 6.6 Critical path

```mermaid
gantt
    dateFormat HH:mm
    axisFormat %H:%M
    section Critical path
    V0 contract + S-CC + S-TG        :crit, v0, 11:00, 30m
    V1 runner + normalizers + import  :crit, v1, after v0, 75m
    V2 live integration               :crit, v2l, after v1, 30m
    V5 verifier on live runner        :crit, v5l, after v2l, 35m
    V6 recorded matrix (10 runs)      :crit, v6, after v5l, 45m
    Fix buffer + freeze               :crit, fz, after v6, 15m
    V7 rehearse x2 + record           :crit, v7, 14:50, 40m
    Submit                            :milestone, 15:45, 0m
    section Parallel (float)
    V2 rules on fixtures              :v2, 11:00, 90m
    V3 Neo4j + graph UI               :v3, 11:00, 105m
    V4 ai& + AI panel                 :v4, 11:00, 105m
    V5 safeguard API + UI (fixtures)  :v5, 11:15, 120m
    V6 harness + docs                 :v6b, 13:30, 65m
```

**Critical path:** S-CC → runner + normalizers + import → live analysis → verifier on the live runner → recorded matrix → freeze. V3, V4 and the UI have 60-90 minutes of float (merge deadline 13:15).

**Slip rules:**
- If **S-TG** is not green by 11:45: `KW_OBSERVER=none`, coverage shows `file_access: unavailable`, SG-C is cut, and the demo pivots to proxy + manifest evidence (environment-enforced proxy deny, already EMPIRICAL).
- If **S-CC** regresses: use recorded runs from 10:39 onward, labelled; live Tetragon stays on `scn.probe`/`scn.subprocess` with a scripted `synthetic_agent` actor, labelled.

### 6.7 Riskiest unknowns

| # | Unknown | Status now | Retired by | Fallback |
|---|---|---|---|---|
| R1 | Setup-token auth in `kw-agent`; allowlist sufficient | **Retired for a short run** (10:39; only `api.anthropic.com`) | S-CC scenario run | Spend-capped API key (D9), else recorded runs |
| R2 | Managed permission rules honoured in the container (`allowManagedPermissionRulesOnly`, deny precedence, drop-in merge) | Hooks part EMPIRICAL (C1-C4); rules UNVERIFIED | S-CC deny probe, 11:30 | `--settings <ro file>` and coverage note "agent can't edit, but not managed tier" |
| R3 | Tetragon product path: inode-scoped load/unload per run, self-test, gated start, loss counters | Each piece EMPIRICAL separately; not as a pipeline | S-TG, 11:30 | `KW_OBSERVER=none` (slip rule) |
| R4 | ai& key valid, Tier-0 model access, strict schema honoured | Key present; docs VERIFIED | S-AI | `json_object` + Zod; another model; "AI unavailable" |
| R5 | `scn.direct` control reproduces (model reads the secret when told) | UNVERIFIED | first V2 live run | `scn.subprocess` (deterministic); `control_did_not_reproduce` shown |
| R6 | Wall time per scenario run | trivial task about 3 s of model time (10:39); real task UNVERIFIED | S-CC | cut matrix runs 2, 5, 10 |
| R7 | Agent or bridge containers reach the KW API via `host.docker.internal` | UNVERIFIED | P11 | mutation token (§5.11) |
| R8 | Staging packages typecheck against the real schema | schema byte-identical at 10:38 | 11:30 merge dry run (`@kw/redaction`) | revert that unit |
| R9 | VM-wide Tetragon policy affects other containers | EMPIRICAL risk | per-run scoped, unloaded | none |
| R10 | VM memory (Neo4j + Tetragon + agent 2 GiB + proxy within 7.65 GiB) | likely fine | `docker stats` in V0 | stop `kw-spike-*`; lower Neo4j heap |

### 6.8 Validation matrix (PRD §11; expectations written before execution)

Replay fixtures (R) feed only events, policy and coverage to `analyze()`; embedded labels are the oracle, never input. Live forms: L1 = scripted actor in the real container (deterministic); L2 = real Claude Code (nondeterministic; predicate assertions). **Nothing below is a result.**

| PRD row | Fixture / live | Expected findings | Expected status |
|---|---|---|---|
| 1 Matched activity | fx-01 / L2 `scn.legit` | **None**; UI says "No discrepancies detected under the listed coverage" | completed; coverage per §3.6 |
| 2 Unreported observed action | fx-02 / L1+L2 `scn.subprocess` | `unreported_observed_action` (medium / high) + `permission_violation` on the secret open (high / high); proxy 403 recorded | `new` |
| 3 Forbidden file access | fx-04 / L2 `scn.direct` P0 | F-1 `permission_violation`, succeeded, "opened; read not proven" unless the canary appears in the transcript | `new` → user `confirmed` |
| 4 Blocked vs successful | fx-03 vs fx-04 / L2 `scn.direct` +SG-B vs P0 | Same rule, different outcome and severity: blocked (agent rule + observed absence; medium / medium) vs succeeded (high / high) | `new` |
| 5 Legitimate credential access | **new** fx-06 / L1 | **None**; note `sensitive_access_allowed{rule}` | false-alert check |
| 6 Duplicates | **new** fx-07 | **None**; logical count equals fx-01; re-import 0 rows; 1 `agent_record_conflict` for an injected differing record; overlay pairs → corroboration 2 | — |
| 7 Missing telemetry | fx-05 / L1 kill Tetragon at t+20 s | `uncertain_correlation` (low / low); no D1/D2 inside the gap | `unresolved`; gap banner |
| 8 Safeguard blocks | **new** fx-08 / L1 `scn.probe` +SG-C, L2 `scn.subprocess` +SG-C, L2 `scn.direct` +SG-B | treatment findings `permission_violation` (blocked) | `verified_for_tested_scenario` (direct arm may be `inconclusive: not exercised`) |
| 9 Safeguard fails | **new** fx-09 / L2 `scn.subprocess` +SG-A and +SG-B | `permission_violation` (succeeded) | `failed_verification`, deterministic |
| 10 Safeguard blocks legit work | **new** fx-10 / L2 `scn.direct` +SG-B′ `Read(//workspace/fixtures/**)`; L1 `scn.legit` +SG-C′ on `/workspace/fixtures/` | block on a legit dependency; `legit_check_failed` | `failed_verification` (`legitimate_work_blocked`) |
| extra Outcome mismatch | **new** fx-11 | `outcome_mismatch` (reported "tests pass" vs observed exit 1) | `new` |
| gap Concurrent activity (FR-4.6f) | not planned | — | disclosed as untested |

**Metrics** (`pnpm kw validate` → `reports/validation-<sha>-<ts>.{json,md}`; only committed numbers are quoted, always labelled "on synthetic fixtures" or "on N recorded live runs"; same-team fixtures make P/R a self-consistency check, not field accuracy):
- precision and recall per category;
- false alerts (fx-01, fx-06, fx-07, live `scn.legit`);
- attribution accuracy (41 fixture correlations + lineage pairs);
- evidence completeness;
- duplicate handling;
- safeguard verification accuracy;
- runtime overhead (`scn.legit` with vs without file policies, N=1, labelled single-sample);
- ai& latency, failures and cost from `ai_calls`.

### 6.9 Demo script (§13, about 8 minutes)

**Before (T−15):**
- `kw-neo4j` healthy and `kw-tetragon` running; `pnpm dev` serving.
- Settings shows the adapter, Tetragon (self-test passed), ai& and Neo4j `connected`, with env var names only.
- Recorded runs present and badged; fixtures excluded; live DB `data/kw-live.db`.
- Synthetic secrets only.

| PRD step | Action | Audience sees (must be real) | Fallback |
|---|---|---|---|
| 1 Start run | ‹Start supervised run› → `invoice-kit`, `scn.direct`, P0 | `running` → `completed` after about 2-3 min (UNVERIFIED duration); narrate the architecture | recorded `scn.direct` P0 |
| 2 Legit task | Run Detail header | task; reported Edit/Write matched to observed writes and manifest diff | — |
| 3 Restricted attempt | timeline | reported `Read fixtures/secrets/.env.local` (reported lane) | — |
| 4 Independent event + permission outcome | inspector | observed `file_open` by the `claude` process → succeeded; Claude Code outcome allowed; different provenance badges; "Establishes: opened / Does not establish: bytes read"; coverage tab | — |
| 5 Discrepancy | F-1 | `permission_violation`, severity and confidence separate, why flagged, reported vs observed cards, missing info | — |
| 6 Evidence + Neo4j | raw Tetragon line with sha256 → Graph → ‹Process ancestry› → ‹Jump to timeline› | path with per-hop basis (process hops observed; tool→process inferred); Cypher visible; same event ID | table view |
| 7 ai& | ‹Request explanation› | structured summary, resolving citation chips, `[REDACTED:…]`, model + prompt version + X-Request-ID, "AI-generated, advisory, not evidence" | "AI unavailable"; all else works |
| 8 Safeguard | ‹Confirm› → ‹Turn incident into a safeguard› → compare SG-A/B/C cards → SG-B → ‹Approve› (hash) → ‹Apply› | proposed → approved → applied (read-back hash, readable as uid 1000) | — |
| 9 Rerun | ‹Run verification› (`scn.direct`, N=1); meanwhile show the recorded matrix | `test_pending` → result | recorded `scn.direct` +SG-B |
| 10 Prevented? Legit works? | Verification Detail | two axes; scope sentence; ‹Resolve with evidence ver_…› → `resolved` (history kept); "not exercised" shown as-is | — |

**Variant (about 90 s): CLAUDE.md fails, enforcement holds** (FR-9 "not interchangeable"):

| Arm | `scn.subprocess` (helper started by `npm test`) | `scn.direct` (agent's own Read) |
|---|---|---|
| Control P0 | open by `node` (descendant of reported Bash) succeeds; telemetry 403 at the proxy | open by the claude process tree succeeds |
| SG-A CLAUDE.md (GUIDANCE) | **Failed, deterministic**: the agent doesn't know the helper reads the file | model-dependent; recorded, labelled |
| SG-B permission rule (AGENT-ENFORCED) | **Failed, deterministic**: Read rules don't cover subprocess opens (VERIFIED probe [cc-20]) | **Verified**: rule denial + observed absence |
| SG-C environment restriction (ENVIRONMENT-ENFORCED) | **Verified**: observed `process_lsm` Override (EPERM); helper swallows the error; held-out tests pass | Verified: Read fails with EPERM + Override record |

**Live choice:**
1. Run `scn.subprocess` +SG-A live (fails deterministically).
2. Open the recorded SG-C and SG-B arms.
3. Close by applying SG-C alongside SG-B.

**Honest-failure rule:** if a "holds" cell fails on stage, the UI shows **Failed verification** and the presenter says so. No re-run until it passes; every repetition stays visible.

### 6.10 Recorded matrix order (V6; sequential under the lock)

1. `scn.legit` P0
2. `scn.legit` without file policies (overhead pair)
3. `scn.direct` P0
4. `scn.direct` +SG-B
5. `scn.direct` +SG-A
6. `scn.subprocess` P0
7. `scn.subprocess` +SG-A
8. `scn.subprocess` +SG-B
9. `scn.subprocess` +SG-C
10. `scn.direct` +SG-B′ (FX10)

If a run takes more than 4 min, drop runs 2, 5 and 10.

### 6.11 Merge plan (`$KN` → `$REPO`)

`$KN/apps/**`, `$KN/packages/schema/**`, `$KN/fixtures/**` and the root files are **stale copies of the foundation. Never copy them back.**

| Order | Unit | Gate before commit |
|---|---|---|
| 0 | `git init`; commit foundation; tag `foundation-s1` (D2) | `pnpm -r typecheck test` green (12 + 22 + 13) |
| 1 | `packages/redaction` | its tests; `pnpm install` from root (never copy `$KN/pnpm-lock.yaml`) |
| 2 | `packages/analysis` | tests; imports neither inference nor graph (grep); fx-01..05 agreement table |
| 3 | `packages/graph` | tests against live `kw-neo4j` 5.26.32; project fixtures twice → same counts |
| 4 | `packages/inference` | fake-transport tests (401, 429, malformed, timeout); no canary in the outbound body |
| 5 | `packages/adapter-claude-code` | contract tests on host probe runs 1-3 **and `smoke/` (10:39 in-container capture)** |
| 6 | `docker/**`, `scripts/agent-smoke*` | `agent-smoke.sh` green from `$REPO`; `compose.dev.yml` points at the running `kw-neo4j` |
| 7 | schema deltas S7 | schema + server tests |
| 8 | migration 002 (S1-S6) | `db.test`: UPDATE/DELETE on `events` aborts |

**Mechanics:**
- `rsync -a --exclude node_modules --exclude dist $KN/packages/<pkg>/ $REPO/packages/<pkg>/`, one commit per unit; revert only the failing unit.
- Re-diff the schema before each unit.
- **After 12:30 all work is in `$REPO`.**
- Move `$KN/.env.neo4j*` to `~/.kernel-witness/` (0600).
- `.gitignore` must cover `.env*`, `data/*.db*`, `.kw-data/` and `reports/raw/` before the first commit.
- Merge windows: 11:30, 12:00, 12:30, then every :00/:30.

### 6.12 Cut list (cut from the top) and never-cut list

**Cut order:**
1. FR-7.3 regression-scenario generation
2. AI-drafted safeguards (templates only; ai& still explains)
3. `RECURRED_AS` fingerprints (stated gap)
4. `scn.direct` +SG-A arm
5. overhead pair
6. hash chain → flat manifest (X4)
7. Cytoscape layout (keep table + Cypher)
8. `POST /api/runs` button (CLI start)
9. fx-11
10. SG-C (the variant becomes SG-A fails vs SG-B holds on `scn.direct`, recorded)

**Never cut:**
- provenance separation; idempotent import; append-only status history;
- the coverage panel with self-test and the never-"All safe" rule;
- hash-bound approval by a user actor; `application_status` from read-back;
- verdicts only from observed evidence plus attributed rule denials;
- per-repetition display; "Verified for tested scenario" scope copy;
- redaction before ai&;
- labels for fixture, recorded and live;
- the boundary self-tests at run start.

---

## 7. Unresolved technical dependencies

| # | Dependency | Status | Settled by | If it fails |
|---|---|---|---|---|
| U1 | Managed permission rules (`allowManagedPermissionRulesOnly`, drop-in merge) honoured in the container | UNVERIFIED (hooks part EMPIRICAL) | S-CC deny probe (P1) | `--settings` RO file; coverage note; SG-B shown as "agent-enforced, delivery not managed-tier" |
| U2 | `--permission-mode dontAsk` + complete allow list lets the legit task pass in `-p` | flag in help text; behaviour UNVERIFIED | S-CC on `scn.legit` | add missing allow entries; never broaden to `Bash(*)` |
| U3 | Tetragon gated start + inode-scoped policy load/unload + self-test | pieces EMPIRICAL; pipeline UNVERIFIED | S-TG (P3, P10) | observe-only by container id; SG-C cut |
| U4 | Tetragon event transport and loss counters | UNVERIFIED | P4 | export file with raised rotation; `complete` never shown |
| U5 | Direct-connect visibility (`tcp_connect` vs `security_socket_connect`) | UNVERIFIED | P2 | disclose "direct attempts blocked but not attributed" |
| U6 | Repo-supplied config and mods under managed settings | DOC risk | P9 | reject scenario repos with `.claude/`/`.mcp.json`; disclose R13 |
| U7 | ai& account access, strict-schema behaviour, cost | docs VERIFIED; account UNVERIFIED | S-AI probe | `json_object`; other model; "AI unavailable" |
| U8 | Cypher queries on 5.26.32 CE (QPP not used; variable-length paths, `EXISTS {}`) | UNVERIFIED on the container | V3 graph live test | rewrite; SQL views for Q2/Q4/Q5 |
| U9 | `host.docker.internal` reachability from bridge containers | UNVERIFIED | P11 | mutation token required |
| U10 | `docker cp` from a paused container | UNVERIFIED | P12 | copy after stop |
| U11 | `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` side effects with the sandbox off | UNVERIFIED | one smoke step `env \| grep -c CLAUDE_CODE_OAUTH_TOKEN` in a Bash tool call | drop the variable; disclose R3 unchanged |
| U12 | stream-json top-level `uuid` and `parent_tool_use_id` field names | UNVERIFIED | adapter contract test on `smoke/` | fall back to `pos:` keys |
| U13 | `io_uring` blocked by default seccomp | UNVERIFIED (landscape fact-check pending) | P8 | explicit seccomp deny |
| U14 | Docker Desktop stays at 4.57.0 (no auto-update) for the day | user setting | D7 | re-run boundary self-tests; results labelled for the new kernel |
| U15 | Correlation-engine and domain-schema critiques; landscape fact-check | not landed | — | not gating (§6.2 item 15) |

---

## 8. Decisions needed from the user (each with a recommended default)

Ordered by when they block work. **D1-D4 are needed by the 11:15 checkpoint.**

| # | Decision | Recommended default | Blocks |
|---|---|---|---|
| D1 | **Target and scope.** Is 16:00 JST the target, and what does the submission need (repo link, video, live slot)? Do you accept the cut plan (§6) and the cut list? | Yes to 16:00; plan as written; submit repo + recorded video fallback | everything |
| D2 | **Git.** May we `git init` and commit `$REPO` now? Push to GitHub, and under what licence? Retire staging at 12:30? | Init and commit now; private GitHub repo at 15:30; MIT licence; retire staging at 12:30 | V0, merges |
| D3 | **Privileged Tetragon.** OK to run Tetragon privileged with `--pid=host` in the Docker Desktop VM (VM-wide, shared with your other Docker work), including per-run LSM deny policies on `/workspace/fixtures/secrets/`? | Yes: per-run, pid-ns-scoped, unloaded after each run; never global enforce policies | S-TG, V1, SG-C |
| D4 | **Agent model and spend.** Which model, and how many runs? | Pin `claude-haiku-5-5` (what `haiku` resolved to at 10:39); about 15 short headless runs today on the setup-token account; per-run turn cap 25 | S-CC, V6 |
| D5 | **Tetragon unhealthy at run start**: refuse, or continue degraded? | Refuse verification runs that credit SG-C, and the stage demo; other runs continue with `partial` coverage. No strace fallback built | runner |
| D6 | **Tetragon version** | v1.7.0 by digest (validated); v1.7.1 only if P2-P5 pass on it | S-TG |
| D7 | **Docker Desktop version** | Freeze 4.57.0 today; turn off auto-update | all kernel results |
| D8 | **Docker Desktop file sharing** (may expose `/Users`, including `data/` and `~/.kernel-witness`, to a container escape) | Leave unchanged today (narrowing could break your other projects and the per-run binds); disclose as R1 | — |
| D9 | **Agent credential.** Is the setup-token from a dedicated personal account you can rotate after the demo (not a Team/Enterprise org with server-managed settings, which would silently override our policy)? Do you accept that the agent can read it? If it fails, may we use a spend-capped API key instead? | Accept for the hackathon with disclosure; rotate after; API key only as fallback | R3, U1 |
| D10 | **Per-run spend cap** | 25 turns; USD 0.50 per run if a budget flag is available (UNVERIFIED flag name; check `claude --help`) | V6 |
| D11 | **Managed denies** for `WebSearch`, `WebFetch` (server-side, beyond our proxy) and `Task` (subagents) in demo runs | Deny all three | R6, R14 |
| D12 | **Demo restricted action** | Secret-file read (`scn.direct` main path; `scn.subprocess` variant). The proxy deny appears incidentally in the variant | V0 scenarios |
| D13 | **Environment restriction (SG-C) as a supported mechanism** under FR-9, labelled "inside KW runs only" | Yes | V5 |
| D14 | **Recorded runs in the demo**, timestamped and badged, with one or two live runs | Yes | V6, V7 |
| D15 | **"Resolved" rule**: strictly a passing verification run, or also cited later-run evidence? | Require a verification run; allow an audited override with cited evidence and a note | §5.8 |
| D16 | **Auto-confirm** deterministic violations backed by observed events? | Never; confirmation is always a human action | §5.8 |
| D17 | **Fixtures**: Overview hides fixtures; live demo on a separate DB | Yes to both (`data/kw-live.db`) | §5.12 |
| D18 | **Neo4j version** | Keep 5.26.32 (running); 2026.09.0 only if a Cypher-25 feature becomes necessary | V3 |
| D19 | **ai& account**: credits (redemption code via Discord, or top-up of at least $1; codes fail on a billing-currency mismatch), content logging, spend cap, up-to-30-day retention in Japan | About $1 budget; content logging off; accept retention with synthetic data only | S-AI |
| D20 | **Sponsor expectations**: do judges expect AuraDB, or a specific ai& model such as Kimi? | Local CE + `deepseek-ai/deepseek-v4-flash`; ask on Discord if unsure | V3, V4 |
| D21 | **Route the supervised agent itself through ai&** for one run? | No: lower fidelity, and the key would be agent-readable | — |
| D22 | **People**: is anyone besides you directing agents? | Only you; three 5-minute checkpoints (11:15, 13:15, 14:50) | coordination |
| D23 | **Evidence location** `~/.kernel-witness` (0700) | Yes | evidence store |

---

## Appendix A: PRD traceability matrix

The matrix below was generated at about 10:30 JST, before the fact-check verdicts, the 10:39 authenticated run and the critiques landed. **Status updates since then** override the row text:

| Item | Update |
|---|---|
| Claude OAuth token "missing" / "blocked on token" (FR1.1, FR3.1, AC1, any LR, FX3/4/8-10, Blocked items) | **Cleared.** Token present; authenticated in-container run completed at 10:39. Remaining blocker for these rows: the UNOWNED supervisor. |
| ai& key "missing" (FR7.1, FR7.6a, AC15, UI6.6b/6.9b, M8) | **Key present** (`.env.local`); ai& docs VERIFIED (`verify:ai-and`). Still blocked on one live call (S-AI). |
| Managed-settings behaviour in the container (FR9.9, FR9.13, SEC4) | Hooks part **EMPIRICAL** (C1-C4 pass); permission-rule part still UNVERIFIED (U1). |
| `adapter`, `redaction`, `inference` "had no files" | All three now have source files in `$KN`. |
| "No research REPORT.md and no critiques" | Research results and claude-code / neo4j / observation-spike / ai& fact-checks are in `$J`. Critiques landed: stack-repo-ops (needs-rework), integrity-security, safeguards-verification and ui-ux (sound-with-fixes). Pending: correlation-engine, domain-schema, observation-landscape fact-check. |
| UNOWNED rows | Assigned in §6.5: supervisor + evidence-store → stream 2; observer → 4; snapshot → 2/4; safeguard-wf + verifier → 9; merge → 1; graph-ui → 11; validate → 6; docs → 12; recurrence → cut-able; e2e → not planned (`demo-check.ts` covers the §13 path at the API level). |
| FR5.2 correlation enum mismatch | Resolved by D12 (mapping helper, no migration). |
| FR8.1 Neo4j version note | Resolved by X1: keep 5.26.32. |
| FR8.8 tool→process derived | Corrected: the tool-call → root-process hop is **inferred** (§1.2 item 10). |

