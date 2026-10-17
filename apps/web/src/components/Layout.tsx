import type { DataMode } from "@kw/schema";
import { NavLink, Outlet } from "react-router";
import { useAuthCheck, useSettingsStatus } from "../api/queries";
import { ApiRequestError, isPermissionDenied } from "../api/client";
import { Cmd, PermissionDenied } from "./states";
import { AskWitnessDrawerProvider, AskWitnessLauncher } from "./askwitness/AskWitnessDrawer";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/runs", label: "Agent Runs", end: false },
  { to: "/findings", label: "Findings", end: false },
  { to: "/safeguards", label: "Safeguards", end: false },
  { to: "/settings", label: "Settings", end: false },
] as const;

export function Layout() {
  return (
    <AskWitnessDrawerProvider>
      <LayoutShell />
    </AskWitnessDrawerProvider>
  );
}

function LayoutShell() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[196px] shrink-0 flex-col border-r border-line bg-surface-1">
        <div className="border-b border-line px-4 py-3">
          <div className="font-mono text-[13px] font-bold tracking-tight text-fg-0">kernel-witness</div>
          <div className="text-[11px] text-fg-2">agent behavior verification</div>
        </div>
        <nav aria-label="Primary" className="flex flex-col py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `border-l-2 px-4 py-1.5 text-[13px] no-underline ${
                  isActive ? "border-fg-0 bg-surface-2 font-medium text-fg-0" : "border-transparent text-fg-1 hover:bg-surface-2 hover:text-fg-0"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line px-4 py-3 text-[11px] text-fg-2">
          API <span className="font-mono">127.0.0.1:4600</span>
          <br />
          local only
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <AuthGate />
        </main>
      </div>
    </div>
  );
}

/** 401/403 on the auth probe replaces every page with the permission-denied state (with a token field). */
function AuthGate() {
  const auth = useAuthCheck();
  if (auth.error && isPermissionDenied(auth.error)) return <PermissionDenied message={auth.error.message} />;
  return <Outlet />;
}

function TopBar() {
  const settings = useSettingsStatus();
  return (
    <div className="shrink-0 border-b border-line bg-surface-1">
      <div className="flex flex-wrap items-center gap-2 px-5 py-2">
        <span
          className="hatch inline-flex items-center rounded-[3px] px-2 py-0.5 text-[11px] text-unknown"
          title="Local build. Integration status (ai&, verification harness, observers, Neo4j) is reported on the Settings page; unavailable parts are shown as unavailable, never simulated."
        >
          Local build: AI is advisory and optional; see Settings for what is connected
        </span>
        <div className="ml-auto flex items-center gap-2 text-[11px]">
          <AskWitnessLauncher />
          <ApiIndicator ok={settings.isSuccess} pending={settings.isPending} error={settings.error} />
        </div>
      </div>
      {settings.data ? <DataModeBanner mode={settings.data.data_mode} /> : null}
    </div>
  );
}

function ApiIndicator({ ok, pending, error }: { ok: boolean; pending: boolean; error: unknown }) {
  if (pending) return <span className="text-fg-2">API: checking…</span>;
  if (ok) return <span className="text-fg-1">API: responding</span>;
  const unreachable = error instanceof ApiRequestError && error.kind === "unreachable";
  return <span className="text-warn">{unreachable ? "API: not reachable" : "API: error"}</span>;
}

export function DataModeBanner({ mode }: { mode: DataMode }) {
  if (!mode.contains_fixture_data) return null;
  const onlyFixtures = mode.live_runs === 0;
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-5 py-1.5 text-[12px] text-fg-1">
      <span className="rounded-[3px] bg-fg-0 px-1.5 py-px font-mono text-[10px] font-bold tracking-wider text-surface-0">FIXTURE DATA</span>
      {onlyFixtures ? (
        <span>
          All {mode.fixture_runs} run{mode.fixture_runs === 1 ? "" : "s"} shown are hand-authored fixtures, not live captures. No live run
          has been recorded.
        </span>
      ) : (
        <span>
          {mode.fixture_runs} fixture run{mode.fixture_runs === 1 ? "" : "s"} and {mode.live_runs} live run{mode.live_runs === 1 ? "" : "s"}.
          Fixture records carry a FIXTURE badge.
        </span>
      )}
      <span className="text-fg-2">
        Loaded with <Cmd>pnpm seed:fixtures</Cmd>
      </span>
    </div>
  );
}
