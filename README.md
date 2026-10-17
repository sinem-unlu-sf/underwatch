# Kernel Witness

Kernel Witness independently observes AI coding agents (initially Claude Code), compares what was observed with what
the agent reported and was permitted to do, and turns verified incidents into tested safeguards. See `docs/PRD.md`.

## Layout

| Path | Package | Purpose |
| --- | --- | --- |
| `packages/schema` | `@kw/schema` | Zod schemas + types for every entity, enums, stable IDs, fixture file format, API contract, finding-status transitions. Consumed as TS source (no build step). |
| `apps/server` | `@kw/server` | Fastify v5 API on `127.0.0.1:4600`, persistence via Node's built-in `node:sqlite` (`data/kernel-witness.db`). |
| `apps/web` | `@kw/web` | Vite + React 19 + React Router 7 + TanStack Query + Tailwind v4 on `127.0.0.1:4601`; proxies `/api` to the server. |
| `fixtures/runs` | — | Synthetic, hand-authored runs for UI development only. Every record has `is_fixture: true`. |

## Commands

```sh
pnpm install
pnpm seed:fixtures   # load fixtures/runs/*.json into the local database (marked is_fixture)
pnpm dev             # server :4600 + web :4601
pnpm typecheck
pnpm test
pnpm build
```

Requirements: Node >= 22.13 (developed on Node 25, where `node:sqlite` works without flags but prints an
`ExperimentalWarning`), pnpm 9.

## Foundation status

Implemented in Phase 1 (research-independent):

- Shared schema: runs, policy versions, events (reported / observed / derived basis), evidence, findings and their
  append-only status history, correlations, safeguards, verification runs, per-run coverage reports.
- Backend API and relational persistence (SQLite via `node:sqlite`), including persisted finding status changes with
  server-enforced transitions.
- UI shell and pages: Overview, Agent Runs, Run Detail, Finding Detail, Safeguards, Settings.
- Fixture data so the UI can be explored. Fixture records are synthetic, flagged `is_fixture`, and badged in the UI.
  They are not captured telemetry and must never be read as live results.

Pending architecture review (not implemented; shown in the UI as "not implemented" / "not configured"):

- Claude Code adapter (hooks / transcript / OpenTelemetry ingestion).
- Independent observers (eBPF, ptrace, file watcher, network proxy, repository diff) and the controlled execution environment.
- Discrepancy/correlation engine and deterministic policy evaluation over live events.
- Neo4j evidence-graph projection and investigation queries.
- ai& Inference explanations and safeguard proposals.
- Safeguard application and verification runs.

Interfaces for these components live in `packages/schema/src/integrations.ts`; there are deliberately no stub
implementations that return made-up data.
