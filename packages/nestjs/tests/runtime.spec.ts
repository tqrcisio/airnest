import { Injectable, Module, type INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  Airnest,
  AirnestModule,
  Ctx,
  Dag,
  Output,
  Params,
  Task,
  type AirnestModuleOptions,
  type DagContext,
} from '../src/index.js';

@Injectable()
class Ledger {
  readonly entries: string[] = [];
}

@Dag({ id: 'invoices', defaults: { retries: 1, retryDelayMs: 0 } })
class InvoicesDag {
  private failuresLeft = 1;

  constructor(private readonly ledger: Ledger) {}

  @Task()
  extract(@Params('customers') customers: string[]) {
    return customers.map((customer, i) => ({ customer, amount: (i + 1) * 100 }));
  }

  @Task({ after: ['extract'] })
  charge(@Output('extract') invoices: { customer: string; amount: number }[]) {
    if (this.failuresLeft-- > 0) throw new Error('payment gateway unavailable');
    return invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  }

  @Task({ after: ['charge'] })
  record(@Ctx() ctx: DagContext<InvoicesDag>) {
    this.ledger.entries.push(`${ctx.params.batch}: ${ctx.output('charge')}`);
  }
}

@Dag({ id: 'slow', defaults: { timeoutMs: 50 } })
class SlowDag {
  @Task()
  async export() {
    await sleep(1000);
  }
}

@Module({ providers: [Ledger, InvoicesDag, SlowDag] })
class BillingModule {}

const fast: Partial<AirnestModuleOptions> = { scheduler: { pollMs: 10 }, worker: { pollMs: 10, leaseMs: 10_000 } };

async function boot(options: Partial<AirnestModuleOptions> = {}) {
  const moduleRef = await Test.createTestingModule({
    imports: [AirnestModule.forRoot({ db: new PGlite(), ...fast, ...options }), BillingModule],
  }).compile();
  moduleRef.useLogger(false);
  return moduleRef.init();
}

async function settled(app: INestApplicationContext, dagId: string, count = 1) {
  const airnest = app.get(Airnest);
  for (let waited = 0; waited < 10_000; waited += 20) {
    const runs = await airnest.runs(dagId, 100);
    if (runs.length >= count && runs.every((run) => run.state === 'success' || run.state === 'failed')) return runs;
    await sleep(20);
  }
  throw new Error(`runs of ${dagId} did not settle`);
}

describe('Airnest runtime', () => {
  let app: INestApplicationContext;
  afterEach(() => app?.close());

  it('runs a manually triggered DAG end to end, retrying a failed task', async () => {
    app = await boot();
    await app
      .get(Airnest)
      .trigger('invoices', { params: { customers: ['acme', 'globex'], batch: 'B-7' }, triggeredBy: 'ana' });

    const [run] = await settled(app, 'invoices');
    expect(run.state).toBe('success');
    expect(run.triggeredBy).toBe('ana');
    expect(run.tasks.find((task) => task.taskId === 'charge')).toMatchObject({ state: 'success', tryNumber: 2 });
    expect(app.get(Ledger).entries).toEqual(['B-7: 300']);
  });

  it('fails a task that outlives its timeout', async () => {
    app = await boot();
    await app.get(Airnest).trigger('slow');

    const [run] = await settled(app, 'slow');
    expect(run.state).toBe('failed');
    expect(run.tasks[0]).toMatchObject({ state: 'failed', lastError: 'timed out after 50ms' });
  });

  it('catches up a cron schedule one run at a time', async () => {
    const now = new Date();
    const minute = 60_000;
    const fourMinutesAgo = new Date(Math.floor(now.getTime() / minute) * minute - 4 * minute);
    @Dag({ id: 'backlog', schedule: '* * * * *', startDate: fourMinutesAgo, catchup: true, maxActiveRuns: 1 })
    class BacklogDag {
      @Task()
      tick() {}
    }
    const moduleRef = await Test.createTestingModule({
      imports: [AirnestModule.forRoot({ db: new PGlite(), ...fast })],
      providers: [BacklogDag],
    }).compile();
    moduleRef.useLogger(false);
    app = await moduleRef.init();

    const runs = await settled(app, 'backlog', 5);
    expect(runs.map((run) => run.logicalDate.getTime()).sort()).toEqual(
      Array.from({ length: 5 }, (_, i) => fourMinutesAgo.getTime() + i * minute),
    );
    expect(runs.every((run) => run.runType === 'scheduled' && run.state === 'success')).toBe(true);
  });

  it('refuses to trigger the same logical date twice', async () => {
    app = await boot({ worker: { enabled: false } });
    const logicalDate = new Date('2026-10-06T06:00:00Z');
    await app.get(Airnest).trigger('slow', { logicalDate });
    await expect(app.get(Airnest).trigger('slow', { logicalDate })).rejects.toThrow('already has a run');
  });

  it('waits for running tasks before the application shuts down', async () => {
    const db = new PGlite();
    app = await boot({ db, shutdownTimeoutMs: 5000 });
    const airnest = app.get(Airnest);
    await airnest.trigger('slow');
    while ((await airnest.runs('slow'))[0].tasks[0].state !== 'running') await sleep(5);
    await app.close();
    app = undefined as never;

    const { rows } = await db.query(`select state, last_error from airnest.task_instance`);
    expect(rows).toEqual([{ state: 'failed', last_error: 'timed out after 50ms' }]);
  });
});
