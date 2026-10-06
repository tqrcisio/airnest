import type { TaskSettings } from '@airnest/core';

export const TASK_OPTIONS = Symbol('airnest:task-options');

type TaskMethod = (...args: never[]) => unknown;

export type TaskOptions<Upstream extends string = string> = Partial<TaskSettings> & { after?: readonly Upstream[] };

export function Task<const Upstream extends string = never>(options: TaskOptions<Upstream> = {}) {
  return <TDag extends Record<Upstream, TaskMethod>>(
    _target: TDag,
    _key: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    Reflect.defineMetadata(TASK_OPTIONS, options, descriptor.value);
  };
}

export type TaskName<TDag> = {
  [K in keyof TDag]: TDag[K] extends TaskMethod ? K : never;
}[keyof TDag] &
  string;

export type TaskOutput<TDag, K extends TaskName<TDag>> = TDag[K] extends (...args: never[]) => infer R
  ? Awaited<R>
  : never;
