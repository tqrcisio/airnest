import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Crumbs, PageState, SectionHeading } from '@/features/crumbs';
import { Attempts } from '@/features/attempts';
import { DagGraph } from '@/features/dag-graph';
import { formatDateTime } from '@/lib/format';
import { useManifest, useRun } from '@/lib/queries';
import { EntityTable } from '@/manifest/entity-table';
import { FieldValue, StateBadge } from '@/manifest/field-value';

type RunSearch = { task?: string };

function RunPage() {
  const { dagId, runId } = Route.useParams();
  const { task: selectedTask } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const manifest = useManifest();
  const run = useRun(runId);

  const entityOf = (slug: string) => manifest.data?.entities.find((entity) => entity.slug === slug);
  const runsEntity = entityOf('runs');
  const tasksEntity = entityOf('task-instances');
  const dagManifest = manifest.data?.dags.find((candidate) => candidate.id === dagId);
  const fieldOf = (entity: typeof runsEntity, name: string) => entity?.fields.find((field) => field.name === name);

  const selectTask = (task: string) => navigate({ search: { task }, replace: true });

  const crumbs = (label: string) => (
    <Crumbs
      items={[{ label: 'DAGs', to: '/dags' }, { label: dagId, to: '/dags/$dagId', params: { dagId } }, { label }]}
    />
  );
  if (run.isError)
    return (
      <div className="space-y-6">
        {crumbs('Run')}
        <PageState text={run.error.message} tone="error" />
      </div>
    );
  if (!run.data || !runsEntity || !tasksEntity || !dagManifest) {
    return (
      <div className="space-y-6">
        {crumbs('Run')}
        <Loader2 className="mx-auto my-10 size-4 animate-spin" />
      </div>
    );
  }

  const detailFields = runsEntity.fields.filter((field) => !['logicalDate', 'state'].includes(field.name));
  return (
    <div className="space-y-8">
      {crumbs(formatDateTime(run.data.logicalDate))}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight tabular-nums">{formatDateTime(run.data.logicalDate)}</h1>
          <StateBadge field={fieldOf(runsEntity, 'state')} value={run.data.state} />
        </div>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          {detailFields
            .filter((field) => run.data[field.name as keyof typeof run.data] !== null)
            .map((field) => (
              <div key={field.name} className="contents">
                <dt className="text-muted-foreground">{field.label}</dt>
                <dd>
                  <FieldValue field={field} value={run.data[field.name as keyof typeof run.data]} />
                </dd>
              </div>
            ))}
        </dl>
      </header>

      <section className="space-y-3">
        <SectionHeading>Graph</SectionHeading>
        <DagGraph
          dag={dagManifest}
          instances={run.data.tasks}
          taskState={fieldOf(tasksEntity, 'state')}
          selectedTask={selectedTask}
          onSelectTask={selectTask}
        />
      </section>

      <section className="space-y-3">
        <SectionHeading>Tasks</SectionHeading>
        <EntityTable
          entity={{
            ...tasksEntity,
            fields: tasksEntity.fields.map((field) => ({ ...field, list: field.list || field.name === 'reason' })),
          }}
          rows={dagManifest.tasks.flatMap((task) => run.data.tasks.filter((instance) => instance.taskId === task.id))}
          rowKey={(task) => task.taskId}
          empty="This run has no tasks."
          identity={(task, content) => (
            <button type="button" className="text-left hover:underline" onClick={() => selectTask(task.taskId)}>
              {content}
            </button>
          )}
        />
      </section>

      {selectedTask && (
        <section className="space-y-3">
          <SectionHeading>{`Attempts of ${selectedTask}`}</SectionHeading>
          <Attempts runId={runId} taskId={selectedTask} />
        </section>
      )}
    </div>
  );
}

export const Route = createFileRoute('/dags/$dagId/runs/$runId')({
  validateSearch: (search: Record<string, unknown>): RunSearch => ({
    task: typeof search.task === 'string' ? search.task : undefined,
  }),
  component: RunPage,
});
