import type { ReactNode } from "react";
import { ApiRequestError } from "../api/client";

export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-2 p-3">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="skeleton h-3.5" style={{ width: `${c === 0 ? 22 : c === 1 ? 30 : 12}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonBlock({ lines = 4 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3.5" style={{ width: `${90 - ((i * 17) % 45)}%` }} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading page">
      <div className="skeleton mb-2 h-5 w-64" />
      <div className="skeleton mb-6 h-3.5 w-96" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[4px] border border-line bg-surface-1 p-3">
          <SkeletonBlock lines={5} />
        </div>
        <div className="rounded-[4px] border border-line bg-surface-1 p-3">
          <SkeletonBlock lines={5} />
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-3 py-4">
      <div className="font-medium text-fg-1">{title}</div>
      {children ? <div className="mt-1 max-w-[70ch] text-fg-2">{children}</div> : null}
    </div>
  );
}

export function Cmd({ children }: { children: ReactNode }) {
  return <code className="rounded-[2px] border border-line bg-surface-0 px-1 py-px font-mono text-[12px] text-fg-0">{children}</code>;
}

export function ErrorState({ error, what = "data" }: { error: unknown; what?: string }) {
  const e = error instanceof ApiRequestError ? error : null;

  if (e?.kind === "unreachable") {
    return (
      <div role="alert" className="m-3 rounded-[4px] border border-warn/50 bg-warn/10 p-3">
        <div className="font-semibold text-warn">API not reachable</div>
        <p className="mt-1 text-fg-1">
          Could not load {what}: the Kernel Witness API did not answer at <Cmd>127.0.0.1:4600</Cmd>. Start it with{" "}
          <Cmd>pnpm --filter @kw/server dev</Cmd> (or <Cmd>pnpm dev</Cmd> from the repo root to run API and UI together).
        </p>
        <p className="mt-1 font-mono text-[11px] text-fg-2">
          {e.path}: {e.message}
        </p>
      </div>
    );
  }

  if (e?.kind === "contract") {
    return (
      <div role="alert" className="m-3 rounded-[4px] border border-risk/55 bg-risk/10 p-3">
        <div className="font-semibold text-risk">Response does not match the API contract</div>
        <p className="mt-1 text-fg-1">
          The API answered, but the data failed validation against <Cmd>@kw/schema</Cmd>, so it is not displayed. This usually
          means the server and web app are out of sync.
        </p>
        <p className="mt-1 font-mono text-[11px] text-fg-2">
          {e.path}: {e.message}
        </p>
        {Array.isArray(e.details) && e.details.length > 0 ? (
          <ul className="mt-1 list-inside list-disc font-mono text-[11px] text-fg-2">
            {(e.details as string[]).map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (e?.kind === "http" && e.code === "not_found") {
    return (
      <div role="alert" className="m-3 rounded-[4px] border border-line-strong bg-surface-2 p-3">
        <div className="font-semibold text-fg-0">Not found</div>
        <p className="mt-1 text-fg-1">{e.message}</p>
      </div>
    );
  }

  return (
    <div role="alert" className="m-3 rounded-[4px] border border-risk/55 bg-risk/10 p-3">
      <div className="font-semibold text-risk">Failed to load {what}</div>
      <p className="mt-1 font-mono text-[11px] text-fg-1">
        {e ? `${e.status ?? ""} ${e.code ?? ""} ${e.message}` : error instanceof Error ? error.message : String(error)}
      </p>
    </div>
  );
}
