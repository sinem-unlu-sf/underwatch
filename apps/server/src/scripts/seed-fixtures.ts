/**
 * Imports every fixtures/runs/*.json into the database. Safe to re-run: existing records are skipped, never duplicated.
 * Usage: pnpm --filter @kw/server seed:fixtures [--fresh] [dir-or-file ...]
 *   --fresh  delete the database file first (discards all data, including status changes made in the UI). Use it after
 *            fixture files were regenerated with changed content; restart a running API server afterwards.
 */
import { existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { FIXTURE_RUNS_DIR, REPO_ROOT, resolveDbLocation } from "../config";
import { openDatabase } from "../db/connection";
import { importFixtureFile, listFixtureFiles, totalCounts, type FixtureImportOutcome } from "../ingest/fixtures";

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const targets = args.filter((a) => a !== "--fresh");
const files = (targets.length ? targets : [FIXTURE_RUNS_DIR]).flatMap((target) => {
  const resolved = path.resolve(process.env.INIT_CWD ?? process.cwd(), target);
  if (!existsSync(resolved)) throw new Error(`Not found: ${resolved}`);
  return statSync(resolved).isDirectory() ? listFixtureFiles(resolved) : [resolved];
});

const location = resolveDbLocation();
console.log(`Database: ${location.path} (${location.configuredVia})`);

if (files.length === 0) {
  console.log(`No fixture files found in ${targets.join(", ") || FIXTURE_RUNS_DIR}. Nothing to import.`);
  process.exit(0);
}

if (fresh && location.path !== ":memory:") {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(location.path + suffix, { force: true });
  console.log("--fresh: deleted existing database. Restart the API server if it is running.");
}

const db = openDatabase(location.path);
const outcomes: FixtureImportOutcome[] = files.map((file) => importFixtureFile(db, file));
db.close();

for (const o of outcomes) {
  const name = o.file.startsWith(REPO_ROOT) ? path.relative(REPO_ROOT, o.file) : o.file;
  if (!o.ok) {
    console.log(`\nFAILED  ${name}`);
    for (const e of o.errors) console.log(`  - ${e}`);
    continue;
  }
  const ins = Object.values(o.counts).reduce((n, c) => n + c.inserted, 0);
  const skip = Object.values(o.counts).reduce((n, c) => n + c.skipped, 0);
  console.log(`\nOK      ${name}  (${o.fixture_id} -> ${o.run_id}): ${ins} inserted, ${skip} skipped`);
  for (const c of o.conflicts) {
    console.log(`  ! ${c.table} ${c.key}: already stored with different ${c.fields.join(", ")} (kept existing row)`);
  }
}

console.log("\nTotals (inserted / skipped):");
const totals = totalCounts(outcomes);
const width = Math.max(...Object.keys(totals).map((k) => k.length));
for (const [table, c] of Object.entries(totals)) console.log(`  ${table.padEnd(width)}  ${String(c.inserted).padStart(5)} / ${c.skipped}`);

const failed = outcomes.filter((o) => !o.ok).length;
console.log(`\n${outcomes.length - failed} of ${outcomes.length} fixture files imported${failed ? `, ${failed} failed validation` : ""}.`);
process.exit(failed ? 1 : 0);
