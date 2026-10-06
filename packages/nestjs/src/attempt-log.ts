import { Logger } from '@nestjs/common';
import type { TaskLogger } from '@airnest/core';
import type { ClaimedTask, LogEntry, LogLevel, PostgresDagStore } from '@airnest/postgres';

const flushEveryMs = 1000;

export class AttemptLog implements TaskLogger {
  private pending: LogEntry[] = [];
  private readonly timer: NodeJS.Timeout;
  private readonly console: Logger;

  constructor(
    private readonly store: PostgresDagStore,
    private readonly task: ClaimedTask,
    private readonly clock: () => Date,
  ) {
    this.console = new Logger(`${task.dagId}.${task.taskId}`);
    this.timer = setInterval(() => void this.flush().catch(() => undefined), flushEveryMs);
  }

  log(message: string) {
    this.write('log', message);
  }

  warn(message: string) {
    this.write('warn', message);
  }

  error(message: string) {
    this.write('error', message);
  }

  async close() {
    clearInterval(this.timer);
    await this.flush();
  }

  private write(level: LogLevel, message: string) {
    const { runId, taskId, tryNumber } = this.task;
    this.pending.push({ runId, taskId, tryNumber, level, message, at: this.clock() });
    this.console[level](message);
  }

  private async flush() {
    const batch = this.pending.splice(0);
    try {
      await this.store.appendLogs(batch);
    } catch (error) {
      this.pending.unshift(...batch);
      throw error;
    }
  }
}
