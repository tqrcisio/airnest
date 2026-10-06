import type { DataInterval as Interval, TaskContext } from '@airnest/core';
import type { TaskName, TaskOutput } from './task.decorator.js';

export const TASK_PARAMS = Symbol('airnest:task-params');

export type TaskParam =
  | { index: number; kind: 'context' | 'logical-date' | 'data-interval' }
  | { index: number; kind: 'params'; name?: string }
  | { index: number; kind: 'output'; taskId: string };

type TaskParamSpec = TaskParam extends infer P ? (P extends TaskParam ? Omit<P, 'index'> : never) : never;

function taskParam(spec: TaskParamSpec): ParameterDecorator {
  return (target, key, index) => {
    const declared: TaskParam[] = Reflect.getMetadata(TASK_PARAMS, target, key!) ?? [];
    Reflect.defineMetadata(TASK_PARAMS, [...declared, { ...spec, index }], target, key!);
  };
}

export type DagContext<TDag = unknown> = Omit<TaskContext, 'output'> & {
  output<K extends TaskName<TDag>>(task: K): TaskOutput<TDag, K>;
};

export type DataInterval = Interval;

export const Ctx = () => taskParam({ kind: 'context' });
export const LogicalDate = () => taskParam({ kind: 'logical-date' });
export const DataInterval = () => taskParam({ kind: 'data-interval' });
export const Params = (name?: string) => taskParam({ kind: 'params', name });
export const Output = (taskId: string) => taskParam({ kind: 'output', taskId });

export function resolveTaskParam(param: TaskParam, ctx: TaskContext) {
  switch (param.kind) {
    case 'context':
      return ctx;
    case 'logical-date':
      return ctx.logicalDate;
    case 'data-interval':
      return ctx.dataInterval;
    case 'params':
      return param.name ? ctx.params[param.name] : ctx.params;
    case 'output':
      return ctx.output(param.taskId);
  }
}
