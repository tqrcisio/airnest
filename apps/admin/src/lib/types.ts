import type { Manifest } from '@airnest/manifest';

export type { DagManifest, EntityManifest, FieldManifest, Manifest, Tone } from '@airnest/manifest';

export type RunState = 'queued' | 'running' | 'success' | 'failed';

export type TaskState =
  | 'pending'
  | 'scheduled'
  | 'queued'
  | 'running'
  | 'deferred'
  | 'up_for_retry'
  | 'success'
  | 'failed'
  | 'upstream_failed'
  | 'skipped'
  | 'removed';

export type Dag = {
  dagId: string;
  version: string;
  definition: { schedule: { cron: string; timezone: string } | null; tags: string[] };
  isPaused: boolean;
  pausedBy: string | null;
  nextRunAfter: string | null;
  lastLogicalDate: string | null;
  lastRunState: RunState | null;
};

export type TaskInstance = {
  taskId: string;
  state: TaskState;
  tryNumber: number;
  reason: string | null;
  lastError: string | null;
};

export type Run = {
  runId: string;
  dagId: string;
  runType: 'scheduled' | 'manual' | 'backfill';
  state: RunState;
  logicalDate: string;
  failureReason: string | null;
  triggeredBy: string | null;
  tasks: TaskInstance[];
};

export type Attempt = {
  attemptId: string;
  tryNumber: number;
  workerId: string;
  state: 'success' | 'failed' | 'up_for_retry';
  error: string | null;
  startedAt: string;
  finishedAt: string;
};

export type DagRow = Dag & { schedule: string | null };

export type EntitySlug = Manifest['entities'][number]['slug'];
