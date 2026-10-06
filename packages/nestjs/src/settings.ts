import { hostname } from 'node:os';
import type { AirnestModuleOptions } from './airnest.module-definition.js';

export function resolveSettings(options: AirnestModuleOptions) {
  return {
    migrate: options.migrate ?? true,
    clock: options.clock ?? (() => new Date()),
    shutdownTimeoutMs: options.shutdownTimeoutMs ?? 30_000,
    pools: options.pools ?? {},
    retentionDays: options.retention?.days,
    enhancers: options.enhancers ?? false,
    scheduler: { enabled: options.scheduler?.enabled ?? true, pollMs: options.scheduler?.pollMs ?? 1000 },
    worker: {
      enabled: options.worker?.enabled ?? true,
      id: options.worker?.id ?? `${hostname()}:${process.pid}`,
      concurrency: options.worker?.concurrency ?? 4,
      pollMs: options.worker?.pollMs ?? 500,
      leaseMs: options.worker?.leaseMs ?? 30_000,
    },
  };
}

export type AirnestSettings = ReturnType<typeof resolveSettings>;
