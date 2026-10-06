import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TaskContext } from '@airnest/core';
import { PostgresDagStore, type ClaimedTask } from '@airnest/postgres';
import { AIRNEST_OPTIONS, type AirnestModuleOptions } from './airnest.module-definition.js';
import { AttemptLog } from './attempt-log.js';
import { DagRegistry } from './dag.registry.js';
import { resolveSettings, type AirnestSettings } from './settings.js';

class LostLease extends Error {}
class WorkerShuttingDown extends Error {}

function abortable<T>(work: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    work.then(resolve, reject);
  });
}

function describeFailure(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class TaskExecutor {
  private readonly logger = new Logger('AirnestWorker');
  private readonly settings: AirnestSettings;
  private readonly inFlight = new Map<string, { done: Promise<void>; controller: AbortController }>();

  constructor(
    @Inject(AIRNEST_OPTIONS) options: AirnestModuleOptions,
    private readonly store: PostgresDagStore,
    private readonly registry: DagRegistry,
  ) {
    this.settings = resolveSettings(options);
  }

  async fillSlots() {
    const { id, concurrency, leaseMs } = this.settings.worker;
    const free = concurrency - this.inFlight.size;
    if (free <= 0) return;
    const claimed = await this.store.claimTasks(id, this.settings.clock(), leaseMs, free);
    for (const task of claimed) this.start(task);
  }

  async drain() {
    const pending = [...this.inFlight.values()];
    const deadline = new Promise((resolve) => setTimeout(resolve, this.settings.shutdownTimeoutMs).unref());
    await Promise.race([Promise.allSettled(pending.map((entry) => entry.done)), deadline]);
    for (const { controller } of this.inFlight.values()) controller.abort(new WorkerShuttingDown());
    await Promise.allSettled([...this.inFlight.values()].map((entry) => entry.done));
  }

  private start(task: ClaimedTask) {
    const controller = new AbortController();
    const done = this.execute(task, controller)
      .catch((error) => this.logger.error(`Could not report ${task.dagId}.${task.taskId}`, describeFailure(error)))
      .finally(() => this.inFlight.delete(task.attemptId));
    this.inFlight.set(task.attemptId, { done, controller });
  }

  private async execute(task: ClaimedTask, controller: AbortController) {
    const { clock } = this.settings;
    const dag = this.registry.find(task.dagId);
    const definition = dag?.definition.tasks.find((candidate) => candidate.id === task.taskId);
    if (!dag || !definition) {
      await this.store.fail(
        task.attemptId,
        `worker ${this.settings.worker.id} does not load ${task.dagId}.${task.taskId}`,
        clock(),
      );
      return;
    }

    const outputs = await this.store.outputs(task.runId, definition.upstream);
    const log = new AttemptLog(this.store, task, clock);
    const ctx: TaskContext = {
      dagId: task.dagId,
      runId: task.runId,
      taskId: task.taskId,
      tryNumber: task.tryNumber,
      logicalDate: task.logicalDate,
      dataInterval: task.dataInterval,
      params: task.params,
      signal: controller.signal,
      logger: log,
      output: (taskId) => {
        if (!definition.upstream.includes(taskId)) throw new Error(`${task.taskId} does not wait for ${taskId}`);
        return outputs[taskId];
      },
    };

    const stopHeartbeat = this.keepLease(task, controller);
    const timeout = definition.timeoutMs
      ? setTimeout(() => controller.abort(new Error(`timed out after ${definition.timeoutMs}ms`)), definition.timeoutMs)
      : undefined;

    try {
      const output = await abortable(dag.runTask(task.taskId, ctx), controller.signal);
      await log.close();
      await this.store.succeed(task.attemptId, output, clock());
    } catch (error) {
      if (error instanceof LostLease || error instanceof WorkerShuttingDown) return;
      log.error(describeFailure(error));
      await log.close();
      await this.store.fail(task.attemptId, describeFailure(error), clock());
    } finally {
      stopHeartbeat();
      clearTimeout(timeout);
      await log.close().catch(() => undefined);
    }
  }

  private keepLease(task: ClaimedTask, controller: AbortController) {
    const { leaseMs } = this.settings.worker;
    const renewEveryThirdOfLease = leaseMs / 3;
    const timer = setInterval(() => {
      this.store
        .heartbeat(task.attemptId, this.settings.clock(), leaseMs)
        .then((stillOwned) => {
          if (!stillOwned) controller.abort(new LostLease());
        })
        .catch((error) =>
          this.logger.warn(`Heartbeat of ${task.dagId}.${task.taskId} failed: ${describeFailure(error)}`),
        );
    }, renewEveryThirdOfLease);
    return () => clearInterval(timer);
  }
}
