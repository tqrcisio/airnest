import type { TaskContext } from '@airnest/core';

export function taskContext(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    dagId: 'sales_daily',
    runId: 'run-1',
    taskId: 'extract',
    tryNumber: 1,
    logicalDate: new Date('2026-10-06T06:00:00Z'),
    dataInterval: { start: new Date('2026-10-05T06:00:00Z'), end: new Date('2026-10-06T06:00:00Z') },
    params: {},
    signal: new AbortController().signal,
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
    output: () => undefined,
    ...overrides,
  };
}
