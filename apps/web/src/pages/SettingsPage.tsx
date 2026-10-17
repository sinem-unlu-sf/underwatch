import type { ComponentStatus, SettingsStatusResponse } from "@kw/schema";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useSettingsStatus } from "../api/queries";
import { IntegrationStatusBadge } from "../components/badges";
import { ErrorState, PageSkeleton } from "../components/states";
import { CredentialsPanel, WorkspacesPanel } from "../components/WorkspacesPanel";
import { KeyValue, Mono, PageHeader, Panel, Time } from "../components/ui";
import { ComponentTable } from "./OverviewPage";

export function SettingsPage() {
  const q = useSettingsStatus();
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={
          <>
            Component status and authorized workspaces. Secrets are never sent to the browser: “configured via” names an environment variable or file, not its value.
            {q.data ? (
              <>
                {" "}
                Reported at <Time iso={q.data.generated_at} />.
              </>
            ) : null}
          </>
        }
      />
      <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <WorkspacesPanel />
        <CredentialsPanel aiStatus={q.data?.ai_inference.status ?? null} />
      </div>
      {q.isPending ? <PageSkeleton /> : q.isError ? <ErrorState error={q.error} what="settings status" /> : <SettingsBody s={q.data} />}
    </div>
  );
}

function ComponentPanel({ title, c, extra }: { title: string; c: ComponentStatus; extra?: Array<[ReactNode, ReactNode]> }) {
  return (
    <Panel title={title} aside={<IntegrationStatusBadge status={c.status} />}>
      <KeyValue
        items={[
          ["Component", c.name],
          ["Detail", <span className="text-fg-1">{c.detail}</span>],
          ["Configured via", c.configured_via ? <Mono>{c.configured_via}</Mono> : <span className="text-fg-2">—</span>],
          ...(extra ?? []),
        ]}
      />
    </Panel>
  );
}

function SettingsBody({ s }: { s: SettingsStatusResponse }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <ComponentPanel title="Agent adapter" c={s.adapter} />
        <ComponentPanel
          title="Policy"
          c={s.policy}
          extra={[
            [
              "Active version",
              s.policy.active_policy_version_id ? <Mono>{s.policy.active_policy_version_id}</Mono> : <span className="text-fg-2">none</span>,
            ],
          ]}
        />
      </div>

      <Panel title="Event collection (independent observers)" bodyClassName="">
        <ComponentTable components={s.collectors} />
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <ComponentPanel title="ai& Inference" c={s.ai_inference} />
        <ComponentPanel title="Neo4j evidence graph" c={s.neo4j} />
        <ComponentPanel title="Database" c={s.database} extra={[["Driver", <Mono>{s.database.driver}</Mono>]]} />
        <Panel title="Data retention and redaction">
          <KeyValue
            items={[
              ["Retention", <span className="flex flex-wrap items-center gap-2"><IntegrationStatusBadge status={s.retention.status} /><span className="text-fg-1">{s.retention.detail}</span></span>],
              [
                "Raw evidence kept",
                s.retention.raw_evidence_retention_days !== null ? (
                  <Mono>{s.retention.raw_evidence_retention_days} days</Mono>
                ) : (
                  <span className="text-fg-2">no retention period set</span>
                ),
              ],
              ["Redaction", <span className="flex flex-wrap items-center gap-2"><IntegrationStatusBadge status={s.redaction.status} /><span className="text-fg-1">{s.redaction.detail}</span></span>],
            ]}
          />
        </Panel>
      </div>

      <Panel title="Data mode">
        <KeyValue
          items={[
            ["Fixture runs", <Mono>{s.data_mode.fixture_runs}</Mono>],
            ["Live runs", <Mono>{s.data_mode.live_runs}</Mono>],
            ["Contains fixture data", s.data_mode.contains_fixture_data ? "yes: fixture records are badged FIXTURE throughout the UI" : "no"],
          ]}
        />
        {s.data_mode.fixture_runs > 0 ? (
          <Link to="/runs?fixture=only" className="mt-2 inline-block text-focus hover:underline">
            View fixture runs
          </Link>
        ) : null}
      </Panel>
    </div>
  );
}
