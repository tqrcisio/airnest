import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { InvalidDagError } from '@airnest/core';
import {
  AirnestModule,
  Ctx,
  Dag,
  DagRegistry,
  DataInterval,
  LogicalDate,
  Output,
  Params,
  Task,
  type DagContext,
} from '../src/index.js';
import { taskContext } from './support.js';

type Sale = { branch: number; total: number };

@Injectable()
class SalesGateway {
  fetch(interval: DataInterval, branches: number[]): Sale[] {
    return branches.map((branch) => ({ branch, total: interval.end.getUTCDate() }));
  }
}

@Dag({
  id: 'sales_daily',
  schedule: '0 3 * * *',
  timezone: 'America/Sao_Paulo',
  catchup: true,
  defaults: { retries: 2 },
})
class SalesDailyDag {
  constructor(private readonly gateway: SalesGateway) {}

  @Task({ retries: 5, retryBackoff: 'exponential' })
  extract(@DataInterval() interval: DataInterval, @Params('branches') branches: number[]) {
    return this.gateway.fetch(interval, branches);
  }

  @Task({ after: ['extract'] })
  total(@Output('extract') sales: Sale[]) {
    return sales.reduce((sum, sale) => sum + sale.total, 0);
  }

  @Task({ after: ['total'], triggerRule: 'all_done' })
  report(@Ctx() ctx: DagContext<SalesDailyDag>, @LogicalDate() day: Date) {
    return `${day.toISOString().slice(0, 10)}: ${ctx.output('total')}`;
  }
}

@Module({ providers: [SalesGateway, SalesDailyDag] })
class SalesModule {}

async function boot(...providers: Function[]) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AirnestModule.forRoot({ db: new PGlite(), scheduler: { enabled: false }, worker: { enabled: false } }),
      SalesModule,
    ],
    providers: providers as never[],
  }).compile();
  await moduleRef.init();
  return moduleRef.get(DagRegistry);
}

describe('@Dag classes', () => {
  it('are discovered in any module and compiled into a DAG definition', async () => {
    const { definition, hash } = (await boot()).get('sales_daily');

    expect(definition.schedule).toEqual({ cron: '0 3 * * *', timezone: 'America/Sao_Paulo' });
    expect(definition.catchup).toBe(true);
    expect(
      definition.tasks.map(({ id, upstream, retries, triggerRule }) => ({ id, upstream, retries, triggerRule })),
    ).toEqual([
      { id: 'extract', upstream: [], retries: 5, triggerRule: 'all_success' },
      { id: 'total', upstream: ['extract'], retries: 2, triggerRule: 'all_success' },
      { id: 'report', upstream: ['total'], retries: 2, triggerRule: 'all_done' },
    ]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('run tasks with injected services and resolved parameters', async () => {
    const dag = (await boot()).get('sales_daily');
    const outputs: Record<string, unknown> = {};
    const ctx = taskContext({ params: { branches: [1, 2] }, output: (taskId) => outputs[taskId] });

    outputs.extract = await dag.runTask('extract', ctx);
    outputs.total = await dag.runTask('total', ctx);

    expect(outputs.extract).toEqual([
      { branch: 1, total: 6 },
      { branch: 2, total: 6 },
    ]);
    expect(await dag.runTask('report', ctx)).toBe('2026-10-06: 12');
  });

  it('refuse to boot when a task reads the output of a task it does not wait for', async () => {
    @Dag({ id: 'misread' })
    class MisreadDag {
      @Task()
      extract() {
        return 1;
      }

      @Task()
      load(@Output('extract') value: number) {
        return value;
      }
    }

    await expect(boot(MisreadDag)).rejects.toThrow(InvalidDagError);
    await expect(boot(MisreadDag)).rejects.toThrow('task load reads the output of extract');
  });

  it('refuse to boot when two providers claim the same DAG id', async () => {
    @Dag({ id: 'sales_daily' })
    class DuplicateDag {
      @Task()
      extract() {}
    }

    await expect(boot(DuplicateDag)).rejects.toThrow('DAG sales_daily is declared by more than one provider');
  });

  it('check dependency names and output types at compile time', () => {
    @Dag({ id: 'typed' })
    class TypedDag {
      @Task()
      extract() {
        return Promise.resolve([1, 2, 3]);
      }

      // @ts-expect-error
      @Task({ after: ['extrac'] })
      load(@Ctx() ctx: DagContext<TypedDag>) {
        expectTypeOf(ctx.output('extract')).toEqualTypeOf<number[]>();
        // @ts-expect-error
        ctx.output('missing');
      }
    }

    expect(TypedDag).toBeDefined();
  });
});
