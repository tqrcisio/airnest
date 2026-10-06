import type { Logger } from '@nestjs/common';

export class PollingLoop {
  private timer?: NodeJS.Timeout;
  private current?: Promise<void>;
  private stopped = true;

  constructor(
    private readonly name: string,
    private readonly logger: Logger,
  ) {}

  start(tick: () => Promise<void>, intervalMs: number) {
    this.stopped = false;
    const run = () => {
      this.current = tick()
        .catch((error) => this.logger.error(`${this.name} tick failed`, error instanceof Error ? error.stack : error))
        .finally(() => {
          if (!this.stopped) this.timer = setTimeout(run, intervalMs);
        });
    };
    run();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.current;
  }
}
