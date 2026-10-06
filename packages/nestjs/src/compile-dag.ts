import {
  airflowDefaultMaxActiveRuns,
  hashDag,
  InvalidDagError,
  taskDefaults,
  validateDag,
  type DagDefinition,
  type TaskContext,
  type TaskDefinition,
} from '@airnest/core';
import type { DagOptions } from './dag.decorator.js';
import { resolveTaskParam, TASK_PARAMS, type TaskParam } from './params.decorator.js';
import { TASK_OPTIONS, type TaskOptions } from './task.decorator.js';

export type RegisteredDag = {
  definition: DagDefinition;
  hash: string;
  runTask(taskId: string, ctx: TaskContext): Promise<unknown>;
};

type DagInstance = Record<string, (...args: unknown[]) => unknown>;

function paramsOf(instance: object, method: string): TaskParam[] {
  const declared: TaskParam[] = Reflect.getMetadata(TASK_PARAMS, Object.getPrototypeOf(instance), method) ?? [];
  return [...declared].sort((a, b) => a.index - b.index);
}

function outputsReadOutsideUpstream(task: TaskDefinition, params: TaskParam[]) {
  return params
    .filter((param) => param.kind === 'output' && !task.upstream.includes(param.taskId))
    .map(
      (param) =>
        `task ${task.id} reads the output of ${(param as { taskId: string }).taskId}, which is not in its after list`,
    );
}

export function compileDag(options: DagOptions, instance: object, methodNames: string[]): RegisteredDag {
  const methods = instance as DagInstance;
  const tasks: TaskDefinition[] = [];
  const params = new Map<string, TaskParam[]>();

  for (const name of methodNames) {
    const taskOptions: TaskOptions | undefined = Reflect.getMetadata(TASK_OPTIONS, methods[name]);
    if (!taskOptions) continue;
    const { after = [], ...settings } = taskOptions;
    tasks.push({ ...taskDefaults, ...options.defaults, ...settings, id: name, upstream: [...after] });
    params.set(name, paramsOf(instance, name));
  }

  const definition: DagDefinition = {
    id: options.id,
    schedule: options.schedule ? { cron: options.schedule, timezone: options.timezone ?? 'UTC' } : null,
    startDate: options.startDate ? new Date(options.startDate).toISOString() : undefined,
    catchup: options.catchup ?? false,
    maxActiveRuns: options.maxActiveRuns ?? airflowDefaultMaxActiveRuns,
    tags: options.tags ?? [],
    params: options.params,
    tasks,
  };
  validateDag(definition);

  const misreadOutputs = tasks.flatMap((task) => outputsReadOutsideUpstream(task, params.get(task.id)!));
  if (misreadOutputs.length > 0) throw new InvalidDagError(definition.id, misreadOutputs);

  return {
    definition,
    hash: hashDag(definition),
    async runTask(taskId, ctx) {
      const taskParams = params.get(taskId);
      if (!taskParams) throw new Error(`DAG ${definition.id} has no task ${taskId}`);
      const args = taskParams.map((param) => resolveTaskParam(param, ctx));
      return methods[taskId].apply(instance, args);
    },
  };
}
