import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { migrate, PostgresDagStore } from '@airnest/postgres';
import { AIRNEST_OPTIONS, type AirnestModuleOptions } from './airnest.module-definition.js';
import { DagRegistry } from './dag.registry.js';
import { PollingLoop } from './polling-loop.js';
import { resolveSettings, type AirnestSettings } from './settings.js';
import { TaskExecutor } from './task-executor.js';

const purgeEveryMs = 60 * 60_000;

@Injectable()
export class AirnestRuntime implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Airnest');
  private readonly settings: AirnestSettings;
  private readonly scheduler = new PollingLoop('scheduler', this.logger);
  private readonly worker = new PollingLoop('worker', this.logger);
  private lastPurgeAt = 0;

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
    await this.store.upsertPools(this.settings.pools, this.settings.clock());
    await this.assertPoolsExist();
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

  private async assertPoolsExist() {
    const declared = new Set((await this.store.pools()).map((pool) => pool.name));
    const missing = this.registry
      .list()
      .flatMap((dag) => dag.definition.tasks.map((task) => ({ dag: dag.definition.id, task })))
      .filter(({ task }) => task.pool && !declared.has(task.pool))
      .map(({ dag, task }) => `${dag}.${task.id} uses pool ${task.pool}`);
    if (missing.length > 0) {
      throw new Error(`Undeclared pools, add them to AirnestModule.forRoot({ pools }): ${missing.join('; ')}`);
    }
  }

  private async purgeOldRuns(now: Date) {
    const days = this.settings.retentionDays;
    if (days === undefined || now.getTime() - this.lastPurgeAt < purgeEveryMs) return;
    this.lastPurgeAt = now.getTime();
    const purged = await this.store.purgeRunsBefore(new Date(now.getTime() - days * 86_400_000));
    if (purged > 0) this.logger.log(`Purged ${purged} runs older than ${days} days`);
  }

  private async schedule() {
    const now = this.settings.clock();
    await this.purgeOldRuns(now);
    const { stalled } = await this.store.createDueRuns(now);
    for (const dagId of stalled) this.logger.error(`Schedule of ${dagId} stopped moving forward; fix its cron`);
    await this.store.reapExpiredLeases(now);
    const { finished } = await this.store.advanceRuns(now);
    for (const run of finished.filter((candidate) => candidate.state === 'failed')) {
      this.logger.warn(`Run ${run.runId} of ${run.dagId} failed: ${run.reason}`);
    }
  }
}
