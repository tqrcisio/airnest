import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { migrate, PostgresDagStore } from '@airnest/postgres';
import { AIRNEST_OPTIONS, type AirnestModuleOptions } from './airnest.module-definition.js';
import { DagRegistry } from './dag.registry.js';
import { PollingLoop } from './polling-loop.js';
import { resolveSettings, type AirnestSettings } from './settings.js';
import { TaskExecutor } from './task-executor.js';

@Injectable()
export class AirnestRuntime implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Airnest');
  private readonly settings: AirnestSettings;
  private readonly scheduler = new PollingLoop('scheduler', this.logger);
  private readonly worker = new PollingLoop('worker', this.logger);

  constructor(
    @Inject(AIRNEST_OPTIONS) private readonly options: AirnestModuleOptions,
    private readonly store: PostgresDagStore,
    private readonly registry: DagRegistry,
    private readonly executor: TaskExecutor,
  ) {
    this.settings = resolveSettings(options);
  }

  async onApplicationBootstrap() {
    if (this.settings.migrate) await migrate(this.options.db);
    for (const dag of this.registry.list()) {
      await this.store.registerDag(dag.definition, dag.hash, this.settings.clock());
    }
    if (this.settings.scheduler.enabled) this.scheduler.start(() => this.schedule(), this.settings.scheduler.pollMs);
    if (this.settings.worker.enabled) this.worker.start(() => this.executor.fillSlots(), this.settings.worker.pollMs);
  }

  async onModuleDestroy() {
    await Promise.all([this.scheduler.stop(), this.worker.stop()]);
    await this.executor.drain();
  }

  private async schedule() {
    const now = this.settings.clock();
    const { stalled } = await this.store.createDueRuns(now);
    for (const dagId of stalled) this.logger.error(`Schedule of ${dagId} stopped moving forward; fix its cron`);
    await this.store.reapExpiredLeases(now);
    const { finished } = await this.store.advanceRuns(now);
    for (const run of finished.filter((candidate) => candidate.state === 'failed')) {
      this.logger.warn(`Run ${run.runId} of ${run.dagId} failed: ${run.reason}`);
    }
  }
}
