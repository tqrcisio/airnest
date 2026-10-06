import type { DagSummary } from '@airnest/postgres';
import type { DagManifest, EntityManifest, FieldManifest, Manifest } from '@airnest/manifest';

export type * from '@airnest/manifest';

const runStates: FieldManifest['options'] = [
  { value: 'queued', label: 'Queued', tone: 'neutral' },
  { value: 'running', label: 'Running', tone: 'info' },
  { value: 'success', label: 'Success', tone: 'success' },
  { value: 'failed', label: 'Failed', tone: 'danger' },
];

const taskStates: FieldManifest['options'] = [
  { value: 'pending', label: 'Pending', tone: 'neutral' },
  { value: 'scheduled', label: 'Scheduled', tone: 'neutral' },
  { value: 'queued', label: 'Queued', tone: 'neutral' },
  { value: 'running', label: 'Running', tone: 'info' },
  { value: 'deferred', label: 'Deferred', tone: 'info' },
  { value: 'up_for_retry', label: 'Up for retry', tone: 'warning' },
  { value: 'success', label: 'Success', tone: 'success' },
  { value: 'failed', label: 'Failed', tone: 'danger' },
  { value: 'upstream_failed', label: 'Upstream failed', tone: 'danger' },
  { value: 'skipped', label: 'Skipped', tone: 'neutral' },
  { value: 'removed', label: 'Removed', tone: 'neutral' },
];

const entities: EntityManifest[] = [
  {
    slug: 'dags',
    label: { singular: 'DAG', plural: 'DAGs' },
    fields: [
      { name: 'dagId', label: 'DAG', kind: 'code', list: true, filter: 'search', sort: true },
      { name: 'schedule', label: 'Schedule', kind: 'code', list: true },
      {
        name: 'isPaused',
        label: 'Status',
        kind: 'enum',
        list: true,
        filter: 'enum',
        options: [
          { value: 'false', label: 'Active', tone: 'success' },
          { value: 'true', label: 'Paused', tone: 'warning' },
        ],
      },
      { name: 'lastRunState', label: 'Last run', kind: 'state', list: true, options: runStates },
      { name: 'nextRunAfter', label: 'Next run', kind: 'datetime', list: true, sort: true },
      { name: 'version', label: 'Version', kind: 'code' },
      { name: 'pausedBy', label: 'Paused by', kind: 'text' },
    ],
    actions: [
      { name: 'trigger', label: 'Trigger run', scope: 'row', input: 'dag-params' },
      {
        name: 'pause',
        label: 'Pause',
        scope: 'row',
        confirm: 'No new scheduled runs will be created until it is resumed.',
      },
      { name: 'unpause', label: 'Resume', scope: 'row' },
    ],
  },
  {
    slug: 'runs',
    label: { singular: 'Run', plural: 'Runs' },
    fields: [
      { name: 'logicalDate', label: 'Logical date', kind: 'datetime', list: true, sort: true },
      { name: 'state', label: 'State', kind: 'state', list: true, filter: 'enum', options: runStates },
      {
        name: 'runType',
        label: 'Type',
        kind: 'enum',
        list: true,
        filter: 'enum',
        options: [
          { value: 'scheduled', label: 'Scheduled', tone: 'neutral' },
          { value: 'manual', label: 'Manual', tone: 'info' },
          { value: 'backfill', label: 'Backfill', tone: 'neutral' },
        ],
      },
      { name: 'triggeredBy', label: 'Triggered by', kind: 'text', list: true },
      { name: 'failureReason', label: 'Failure reason', kind: 'text' },
      { name: 'dagId', label: 'DAG', kind: 'relation', relation: 'dags' },
    ],
    actions: [],
  },
  {
    slug: 'task-instances',
    label: { singular: 'Task', plural: 'Tasks' },
    fields: [
      { name: 'taskId', label: 'Task', kind: 'code', list: true },
      { name: 'state', label: 'State', kind: 'state', list: true, options: taskStates },
      { name: 'tryNumber', label: 'Attempt', kind: 'number', list: true },
      { name: 'reason', label: 'Reason', kind: 'text' },
      { name: 'lastError', label: 'Last error', kind: 'text' },
    ],
    actions: [],
  },
  {
    slug: 'attempts',
    label: { singular: 'Attempt', plural: 'Attempts' },
    fields: [
      { name: 'tryNumber', label: 'Attempt', kind: 'number', list: true },
      {
        name: 'state',
        label: 'Outcome',
        kind: 'state',
        list: true,
        options: taskStates.filter((state) => ['success', 'failed', 'up_for_retry'].includes(state.value)),
      },
      { name: 'workerId', label: 'Worker', kind: 'code', list: true },
      { name: 'startedAt', label: 'Started', kind: 'datetime', list: true },
      { name: 'finishedAt', label: 'Finished', kind: 'datetime', list: true },
      { name: 'error', label: 'Error', kind: 'text' },
    ],
    actions: [],
  },
];

export function toDagManifest(dag: DagSummary): DagManifest {
  const { definition } = dag;
  return {
    id: dag.dagId,
    version: dag.version,
    schedule: definition.schedule,
    catchup: definition.catchup,
    maxActiveRuns: definition.maxActiveRuns,
    tags: definition.tags,
    params: definition.params ?? null,
    isPaused: dag.isPaused,
    tasks: definition.tasks.map((task) => ({
      id: task.id,
      upstream: task.upstream,
      triggerRule: task.triggerRule,
      retries: task.retries,
      timeoutMs: task.timeoutMs ?? null,
    })),
  };
}

export function buildManifest(dags: DagSummary[]): Manifest {
  return { version: 1, entities, dags: dags.map(toDagManifest) };
}
