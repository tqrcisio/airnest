import { Inject, Injectable } from '@nestjs/common';
import { PostgresDagStore, type ClearOptions } from '@airnest/postgres';
import { AIRNEST_OPTIONS, type AirnestModuleOptions } from './airnest.module-definition.js';
import { DagRegistry } from './dag.registry.js';
import { resolveSettings } from './settings.js';

export type TriggerOptions = {
  params?: Record<string, unknown>;
  triggeredBy?: string;
  logicalDate?: Date;
  partition?: string;
};

export type BackfillOptions = { params?: Record<string, unknown>; triggeredBy?: string; partition?: string };

export class RunAlreadyExistsError extends Error {
  constructor(
    readonly dagId: string,
    readonly logicalDate: Date,
    readonly partition = '',
  ) {
    super(`DAG ${dagId}${partition ? ` [${partition}]` : ''} already has a run for ${logicalDate.toISOString()}`);
  }
}

@Injectable()
export class Airnest {
  private readonly clock: () => Date;

  constructor(
    @Inject(AIRNEST_OPTIONS) options: AirnestModuleOptions,
    private readonly store: PostgresDagStore,
    private readonly registry: DagRegistry,
  ) {
    this.clock = resolveSettings(options).clock;
  }

  async trigger(dagId: string, options: TriggerOptions = {}) {
    const now = this.clock();
    const logicalDate = options.logicalDate ?? now;
    const runId = await this.store.createRun(
      {
        dagId,
        partitionKey: options.partition,
        logicalDate,
        dataInterval: { start: logicalDate, end: logicalDate },
        runType: 'manual',
        params: options.params,
        triggeredBy: options.triggeredBy,
      },
      now,
    );
    if (!runId) throw new RunAlreadyExistsError(dagId, logicalDate, options.partition);
    return runId;
  }

  async clear(runId: string, options: ClearOptions = {}) {
    const cleared = await this.store.clearRun(runId, options, this.clock());
    if (!cleared) throw new Error(`Run ${runId} does not exist`);
    return cleared;
  }

  backfill(dagId: string, range: { from: Date; to: Date }, { partition, ...options }: BackfillOptions = {}) {
    return this.store.createBackfill(
      dagId,
      range.from,
      range.to,
      { ...options, partitionKey: partition },
      this.clock(),
    );
  }

  runs(dagId: string, limit?: number, partition?: string) {
    return this.store.runs(dagId, limit, partition);
  }

  run(runId: string) {
    return this.store.run(runId);
  }

  async outputs(runId: string) {
    const run = await this.store.run(runId);
    return run
      ? this.store.outputs(
          runId,
          run.tasks.map((task) => task.taskId),
        )
      : {};
  }

  partitions(dagId: string) {
    return this.store.partitions(dagId);
  }

  async refreshPartitions(dagId: string) {
    const { resolvePartitions } = this.registry.get(dagId);
    if (!resolvePartitions) throw new Error(`DAG ${dagId} is not partitioned`);
    return this.store.syncPartitions(dagId, await resolvePartitions(), this.clock());
  }
}
