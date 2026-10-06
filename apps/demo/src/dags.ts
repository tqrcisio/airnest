import { Ctx, Dag, DataInterval, Output, Params, Task, TaskLog, type DagContext } from '@airnest/nestjs';
import type { TaskLogger } from '@airnest/core';
import { failSometimes, work } from './chaos.js';

const hour = 60 * 60_000;
const day = 24 * hour;

type Sale = { branch: number; total: number };

@Dag({
  id: 'sales_daily',
  schedule: '*/20 * * * *',
  timezone: 'America/Sao_Paulo',
  startDate: new Date(Date.now() - 8 * hour),
  catchup: true,
  maxActiveRuns: 3,
  tags: ['sales', 'warehouse'],
  defaults: { retries: 2, retryDelayMs: 1500 },
})
export class SalesDailyDag {
  @Task()
  async extract(@DataInterval() interval: DataInterval, @Ctx() ctx: DagContext) {
    ctx.logger.log(`reading sales from ${interval.start.toISOString()} to ${interval.end.toISOString()}`);
    await work(300, 1200, ctx.signal);
    ctx.logger.log('3 branches fetched');
    failSometimes(0.1, 'source database refused the connection');
    return [1, 2, 3].map((branch) => ({ branch, total: interval.end.getUTCMinutes() * branch }));
  }

  @Task({ after: ['extract'] })
  async transform(@Output('extract') sales: Sale[]) {
    await work(200, 600);
    return sales.map((sale) => ({ ...sale, total: Math.round(sale.total * 1.1) }));
  }

  @Task({ after: ['transform'], pool: 'warehouse' })
  async load(@Output('transform') sales: Sale[], @TaskLog() log: TaskLogger) {
    log.log(`upserting ${sales.length} rows`);
    await work(300, 900);
    failSometimes(0.15, 'warehouse lock timeout');
    return { rows: sales.length };
  }
}

@Dag({
  id: 'invoices',
  tags: ['billing'],
  params: {
    type: 'object',
    properties: {
      customers: { type: 'array', items: { type: 'string' }, default: ['acme', 'globex'] },
      dryRun: { type: 'boolean', default: false },
    },
  },
  defaults: { retries: 1, retryDelayMs: 1000 },
})
export class InvoicesDag {
  @Task()
  async fetch_customers(@Params('customers') customers: string[] = ['acme', 'globex']) {
    await work(200, 500);
    return customers;
  }

  @Task({ after: ['fetch_customers'] })
  async charge_card(@Output('fetch_customers') customers: string[], @TaskLog() log: TaskLogger) {
    for (const customer of customers) log.log(`charging ${customer}`);
    await work(500, 1500);
    failSometimes(0.3, 'card processor returned 503');
    return customers.length;
  }

  @Task({ after: ['fetch_customers'] })
  async charge_boleto(@Output('fetch_customers') customers: string[]) {
    await work(400, 1200);
    return customers.length;
  }

  @Task({ after: ['charge_card', 'charge_boleto'], triggerRule: 'all_done' })
  async reconcile(@Ctx() ctx: DagContext<InvoicesDag>) {
    await work(200, 600);
    return { card: ctx.output('charge_card') ?? 0, boleto: ctx.output('charge_boleto') };
  }

  @Task({ after: ['charge_card', 'charge_boleto'], triggerRule: 'one_failed' })
  async notify_failure() {
    await work(100, 300);
  }
}

@Dag({
  id: 'nightly_export',
  schedule: '0 2 * * *',
  timezone: 'America/Sao_Paulo',
  startDate: new Date(Date.now() - 6 * day),
  catchup: true,
  maxActiveRuns: 2,
  tags: ['export'],
})
export class NightlyExportDag {
  @Task({ timeoutMs: 1500, retries: 1, retryDelayMs: 1000 })
  async export(@Ctx() ctx: DagContext) {
    await work(400, 2200, ctx.signal);
    return { file: `export-${ctx.logicalDate.toISOString().slice(0, 10)}.csv` };
  }

  @Task({ after: ['export'] })
  async upload(@Output('export') exported: { file: string }) {
    await work(200, 700);
    return exported.file;
  }
}
