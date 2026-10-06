import { createHash } from 'node:crypto';
import type { TriggerRule } from './trigger-rules.js';

export type RetryBackoff = 'fixed' | 'exponential';

export type TaskDefinition = {
  id: string;
  upstream: string[];
  triggerRule: TriggerRule;
  retries: number;
  retryDelayMs: number;
  retryBackoff: RetryBackoff;
  maxRetryDelayMs: number;
  timeoutMs?: number;
  pool?: string;
};

export type CronSchedule = { cron: string; timezone: string };

export type DagDefinition = {
  id: string;
  schedule: CronSchedule | null;
  startDate?: string;
  catchup: boolean;
  maxActiveRuns: number;
  tags: string[];
  params?: Record<string, unknown>;
  tasks: TaskDefinition[];
};

export type TaskSettings = Omit<TaskDefinition, 'id' | 'upstream'>;

const fiveMinutes = 5 * 60_000;
const oneDay = 24 * 60 * 60_000;

export const taskDefaults: TaskSettings = {
  triggerRule: 'all_success',
  retries: 0,
  retryDelayMs: fiveMinutes,
  retryBackoff: 'fixed',
  maxRetryDelayMs: oneDay,
};

export const airflowDefaultMaxActiveRuns = 16;

export class InvalidDagError extends Error {
  constructor(
    readonly dagId: string,
    readonly problems: string[],
  ) {
    super(`DAG ${dagId} is invalid: ${problems.join('; ')}`);
  }
}

export function topologicalOrder(dag: DagDefinition): string[] {
  const pendingUpstream = new Map(dag.tasks.map((task) => [task.id, task.upstream.length]));
  const downstream = new Map<string, string[]>(dag.tasks.map((task) => [task.id, []]));
  for (const task of dag.tasks) {
    for (const parent of task.upstream) downstream.get(parent)?.push(task.id);
  }

  const frontier = dag.tasks.filter((task) => task.upstream.length === 0).map((task) => task.id);
  const order: string[] = [];
  while (frontier.length > 0) {
    const id = frontier.shift()!;
    order.push(id);
    for (const child of downstream.get(id) ?? []) {
      const remaining = pendingUpstream.get(child)! - 1;
      pendingUpstream.set(child, remaining);
      if (remaining === 0) frontier.push(child);
    }
  }
  return order;
}

export function validateDag(dag: DagDefinition) {
  const problems: string[] = [];
  const ids = new Set<string>();

  for (const task of dag.tasks) {
    if (ids.has(task.id)) problems.push(`task ${task.id} is declared twice`);
    ids.add(task.id);
  }
  for (const task of dag.tasks) {
    for (const parent of task.upstream) {
      if (!ids.has(parent)) problems.push(`task ${task.id} depends on unknown task ${parent}`);
      if (parent === task.id) problems.push(`task ${task.id} depends on itself`);
    }
  }
  if (dag.tasks.length === 0) problems.push('it has no tasks');
  if (dag.maxActiveRuns < 1) problems.push('maxActiveRuns must be at least 1');

  if (problems.length === 0) {
    const ordered = new Set(topologicalOrder(dag));
    const inCycle = dag.tasks.filter((task) => !ordered.has(task.id)).map((task) => task.id);
    if (inCycle.length > 0) problems.push(`tasks ${inCycle.join(', ')} form a cycle`);
  }

  if (problems.length > 0) throw new InvalidDagError(dag.id, problems);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashDag(dag: DagDefinition) {
  return createHash('sha256').update(canonicalJson(dag)).digest('hex');
}
