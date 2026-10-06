import { createFileRoute, Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Crumbs, PageState } from '@/features/crumbs';
import { DagActions } from '@/features/dag-actions';
import { useDags, useManifest } from '@/lib/queries';
import type { DagRow } from '@/lib/types';
import { EntityTable } from '@/manifest/entity-table';
import { useEntity } from '@/manifest/use-entity';

function DagsPage() {
  const dags = useDags();
  const manifest = useManifest();
  const { entity } = useEntity('dags');

  const rows: DagRow[] = (dags.data ?? []).map((dag) => ({
    ...dag,
    schedule: dag.definition.schedule ? `${dag.definition.schedule.cron} (${dag.definition.schedule.timezone})` : null,
  }));

  return (
    <div className="space-y-6">
      <Crumbs items={[{ label: 'DAGs' }]} />
      {dags.isPending || !entity ? (
        <Loader2 className="mx-auto my-10 size-4 animate-spin" />
      ) : dags.isError ? (
        <PageState text="Could not load the DAGs" tone="error" />
      ) : (
        <EntityTable
          entity={entity}
          rows={rows}
          rowKey={(row) => row.dagId}
          empty="No DAG registered yet. Start a worker that loads one."
          identity={(row, content) => (
            <Link to="/dags/$dagId" params={{ dagId: row.dagId }} className="hover:underline">
              {content}
            </Link>
          )}
          actions={(row) => {
            const dag = manifest.data?.dags.find((candidate) => candidate.id === row.dagId);
            return dag ? <DagActions dag={dag} isPaused={row.isPaused} layout="menu" /> : null;
          }}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute('/dags/')({ component: DagsPage });
