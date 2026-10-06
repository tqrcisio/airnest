import { createFileRoute, Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Badge } from '@airnest/ui/components/badge';
import { Crumbs, PageState, SectionHeading } from '@/features/crumbs';
import { DagActions } from '@/features/dag-actions';
import { DagGraph } from '@/features/dag-graph';
import { RunGrid } from '@/features/run-grid';
import { formatDateTime } from '@/lib/format';
import { useDag, useManifest, useRuns } from '@/lib/queries';
import { EntityTable } from '@/manifest/entity-table';
import { toneBadge } from '@/manifest/tone';

function DagPage() {
  const { dagId } = Route.useParams();
  const manifest = useManifest();
  const dag = useDag(dagId);
  const runs = useRuns(dagId, 30);

  const dagManifest = manifest.data?.dags.find((candidate) => candidate.id === dagId);
  const runsEntity = manifest.data?.entities.find((entity) => entity.slug === 'runs');
  const runState = runsEntity?.fields.find((field) => field.name === 'state');
  const taskState = manifest.data?.entities
    .find((entity) => entity.slug === 'task-instances')
    ?.fields.find((field) => field.name === 'state');

  const crumbs = <Crumbs items={[{ label: 'DAGs', to: '/dags' }, { label: dagId }]} />;
  if (dag.isError)
    return (
      <div className="space-y-6">
        {crumbs}
        <PageState text={dag.error.message} tone="error" />
      </div>
    );
  if (!dag.data || !dagManifest || !runsEntity) {
    return (
      <div className="space-y-6">
        {crumbs}
        <Loader2 className="mx-auto my-10 size-4 animate-spin" />
      </div>
    );
  }

  const schedule = dag.data.definition.schedule;
  return (
    <div className="space-y-8">
      {crumbs}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight break-all">{dagId}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge className={toneBadge[dag.data.isPaused ? 'warning' : 'success']}>
              {dag.data.isPaused ? 'Paused' : 'Active'}
            </Badge>
            {schedule ? (
              <span className="font-mono">
                {schedule.cron} · {schedule.timezone}
              </span>
            ) : (
              <span>Manual runs only</span>
            )}
            {dag.data.nextRunAfter && !dag.data.isPaused && (
              <span className="tabular-nums">Next run {formatDateTime(dag.data.nextRunAfter)}</span>
            )}
            {dagManifest.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <DagActions dag={dagManifest} isPaused={dag.data.isPaused} layout="buttons" />
      </header>

      <section className="space-y-3">
        <SectionHeading>Runs</SectionHeading>
        {runs.data ? (
          <RunGrid dag={dagManifest} runs={runs.data} runState={runState} taskState={taskState} />
        ) : (
          <Loader2 className="size-4 animate-spin" />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading>Graph</SectionHeading>
        <DagGraph dag={dagManifest} />
      </section>

      <section className="space-y-3">
        <SectionHeading>Recent runs</SectionHeading>
        <EntityTable
          entity={runsEntity}
          rows={(runs.data ?? []).slice(0, 10)}
          rowKey={(run) => run.runId}
          empty="No runs yet."
          identity={(run, content) => (
            <Link to="/dags/$dagId/runs/$runId" params={{ dagId, runId: run.runId }} className="hover:underline">
              {content}
            </Link>
          )}
        />
      </section>
    </div>
  );
}

export const Route = createFileRoute('/dags/$dagId/')({ component: DagPage });
