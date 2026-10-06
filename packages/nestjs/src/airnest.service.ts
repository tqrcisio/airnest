import { Inject, Injectable } from '@nestjs/common';
import { PostgresDagStore } from '@airnest/postgres';
import { AIRNEST_OPTIONS, type AirnestModuleOptions } from './airnest.module-definition.js';
import { resolveSettings } from './settings.js';

export type TriggerOptions = {
  params?: Record<string, unknown>;
  triggeredBy?: string;
  logicalDate?: Date;
};

export class RunAlreadyExistsError extends Error {
  constructor(
    readonly dagId: string,
    readonly logicalDate: Date,
  ) {
    super(`DAG ${dagId} already has a run for ${logicalDate.toISOString()}`);
  }
}

@Injectable()
export class Airnest {
  private readonly clock: () => Date;

  constructor(
    @Inject(AIRNEST_OPTIONS) options: AirnestModuleOptions,
    private readonly store: PostgresDagStore,
  ) {
    this.clock = resolveSettings(options).clock;
  }

  async trigger(dagId: string, options: TriggerOptions = {}) {
    const now = this.clock();
    const logicalDate = options.logicalDate ?? now;
    const runId = await this.store.createRun(
      {
        dagId,
        logicalDate,
        dataInterval: { start: logicalDate, end: logicalDate },
        runType: 'manual',
        params: options.params,
        triggeredBy: options.triggeredBy,
      },
      now,
    );
    if (!runId) throw new RunAlreadyExistsError(dagId, logicalDate);
    return runId;
  }

  runs(dagId: string, limit?: number) {
    return this.store.runs(dagId, limit);
  }
}
