import { Link, useParams } from "react-router";
import { useSafeguard } from "../api/queries";
import { SafeguardReview } from "../components/safeguards/SafeguardReview";
import { ErrorState, PageSkeleton } from "../components/states";
import { Mono, PageHeader, Panel } from "../components/ui";

export function SafeguardDetailPage() {
  const { id = "" } = useParams();
  const q = useSafeguard(id);
  return (
    <div>
      <PageHeader
        title="Safeguard"
        subtitle={<Mono>{id}</Mono>}
        actions={
          <Link to="/safeguards" className="btn">
            All safeguards
          </Link>
        }
      />
      {q.isPending ? (
        <PageSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} what="this safeguard" />
      ) : (
        <Panel>
          <SafeguardReview detail={q.data} />
        </Panel>
      )}
    </div>
  );
}
