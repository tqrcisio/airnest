import { validateDag, type CronSchedule, type DagDefinition, type TaskDefinition } from './definition.js';

export type DataInterval = { start: Date; end: Date };

export type TaskRef<T> = { readonly id: string; readonly output?: T };

export type TaskContext = {
  dagId: string;
  runId: string;
  taskId: string;
  tryNumber: number;
  logicalDate: Date;
  dataInterval: DataInterval;
  params: Record<string, unknown>;
  signal: AbortSignal;
  output<T>(task: TaskRef<T>): T;
};

export type TaskHandler<T> = (ctx: TaskContext) => T | Promise<T>;

type TaskSettings = Omit<TaskDefinition, 'id' | 'upstream'>;

export type TaskOptions = Partial<TaskSettings> & { after?: TaskRef<unknown>[] };

export type DagOptions = {
  id: string;
  schedule?: string | null;
  timezone?: string;
  startDate?: Date;
  catchup?: boolean;
  maxActiveRuns?: number;
  tags?: string[];
  params?: Record<string, unknown>;
  defaults?: Partial<TaskSettings>;
};

export type Dag = {
  definition: DagDefinition;
  handlers: ReadonlyMap<string, TaskHandler<unknown>>;
};

export type DagBuilder = {
  task<T>(id: string, handler: TaskHandler<T>): TaskRef<T>;
  task<T>(id: string, options: TaskOptions, handler: TaskHandler<T>): TaskRef<T>;
};

const fiveMinutes = 5 * 60_000;
const oneDay = 24 * 60 * 60_000;
const airflowDefaultMaxActiveRuns = 16;

const taskDefaults: TaskSettings = {
  triggerRule: 'all_success',
  retries: 0,
  retryDelayMs: fiveMinutes,
  retryBackoff: 'fixed',
  maxRetryDelayMs: oneDay,
};

function toSchedule(options: DagOptions): CronSchedule | null {
  return options.schedule ? { cron: options.schedule, timezone: options.timezone ?? 'UTC' } : null;
}

export function defineDag(options: DagOptions, build: (dag: DagBuilder) => void): Dag {
  const tasks: TaskDefinition[] = [];
  const handlers = new Map<string, TaskHandler<unknown>>();

  function task<T>(id: string, ...args: [TaskHandler<T>] | [TaskOptions, TaskHandler<T>]): TaskRef<T> {
    const [taskOptions, handler] = args.length === 1 ? [{}, args[0]] : args;
    const { after = [], ...settings } = taskOptions;
    tasks.push({ ...taskDefaults, ...options.defaults, ...settings, id, upstream: after.map((ref) => ref.id) });
    handlers.set(id, handler as TaskHandler<unknown>);
    return { id };
  }

  build({ task });

  const definition: DagDefinition = {
    id: options.id,
    schedule: toSchedule(options),
    startDate: options.startDate?.toISOString(),
    catchup: options.catchup ?? false,
    maxActiveRuns: options.maxActiveRuns ?? airflowDefaultMaxActiveRuns,
    tags: options.tags ?? [],
    params: options.params,
    tasks,
  };
  validateDag(definition);
  return { definition, handlers };
}
