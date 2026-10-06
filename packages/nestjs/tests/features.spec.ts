import {
  Injectable,
  Module,
  UseGuards,
  UseInterceptors,
  type CallHandler,
  type CanActivate,
  type ExecutionContext,
  type INestApplicationContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { map } from 'rxjs';
import { PostgresDagStore } from '@airnest/postgres';
import {
  Airnest,
  AirnestModule,
  Ctx,
  Dag,
  Task,
  TaskLog,
  type AirnestModuleOptions,
  type DagContext,
} from '../src/index.js';
import type { TaskLogger } from '@airnest/core';

const fast: Partial<AirnestModuleOptions> = { scheduler: { pollMs: 10 }, worker: { pollMs: 10, leaseMs: 10_000 } };

@Injectable()
class Flaky {
  failuresLeft = 1;
}

@Dag({ id: 'logged' })
class LoggedDag {
  constructor(private readonly flaky: Flaky) {}

  @Task()
  extract(@TaskLog() log: TaskLogger) {
    log.log('connecting');
    log.warn('slow source');
    if (this.flaky.failuresLeft-- > 0) throw new Error('source went away');
    return 3;
  }

  @Task({ after: ['extract'] })
  load(@Ctx() ctx: DagContext<LoggedDag>) {
    ctx.logger.log(`loading ${ctx.output('extract')} rows`);
  }
}

@Dag({ id: 'pooled', defaults: { pool: 'warehouse' } })
class PooledDag {
  @Task()
  extract() {
    return 1;
  }
}

@Injectable()
class RequireAllowedParam implements CanActivate {
  canActivate(context: ExecutionContext) {
    const [ctx] = context.getArgs<[DagContext]>();
    return context.getType<string>() === 'airnest' && ctx.params.allowed === true;
  }
}

@Injectable()
class DoubleOutput implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((value: number) => value * 2));
  }
}

@Dag({ id: 'guarded' })
@UseGuards(RequireAllowedParam)
class GuardedDag {
  @Task()
  @UseInterceptors(DoubleOutput)
  extract() {
    return 21;
  }
}

async function boot(options: Partial<AirnestModuleOptions>, ...providers: Function[]) {
  @Module({ providers: [Flaky, ...providers] as never[] })
  class FeatureModule {}

  const db = new PGlite();
  const moduleRef = await Test.createTestingModule({
    imports: [AirnestModule.forRoot({ db, ...fast, ...options }), FeatureModule],
  }).compile();
  moduleRef.useLogger(false);
  return { app: await moduleRef.init(), store: new PostgresDagStore(db) };
}

async function settle(app: INestApplicationContext, dagId: string, runId: string) {
  for (let waited = 0; waited < 10_000; waited += 20) {
    const run = (await app.get(Airnest).runs(dagId, 50)).find((candidate) => candidate.runId === runId);
    if (run && (run.state === 'success' || run.state === 'failed')) return run;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`run ${runId} did not settle`);
}

describe('task logs, clearing and backfills', () => {
  let app: INestApplicationContext;
  afterEach(() => app?.close());

  it('stores what tasks log, including the failure of an attempt', async () => {
    const booted = await boot({}, LoggedDag);
    app = booted.app;
    const runId = await app.get(Airnest).trigger('logged');
    expect((await settle(app, 'logged', runId)).state).toBe('failed');

    const lines = await booted.store.logs(runId, 'extract');
    expect(lines.map((line) => [line.tryNumber, line.level, line.message])).toEqual([
      [1, 'log', 'connecting'],
      [1, 'warn', 'slow source'],
      [1, 'error', 'source went away'],
    ]);

    expect(await app.get(Airnest).clear(runId, { onlyFailed: true, clearedBy: 'ana' })).toEqual(['extract', 'load']);
    expect((await settle(app, 'logged', runId)).state).toBe('success');
    expect((await booted.store.logs(runId, 'load')).map((line) => line.message)).toEqual(['loading 3 rows']);
  });

  it('backfills a manual-only DAG only when it has a schedule', async () => {
    const booted = await boot({}, LoggedDag);
    app = booted.app;
    await expect(
      app.get(Airnest).backfill('logged', { from: new Date('2026-10-01'), to: new Date('2026-10-02') }),
    ).rejects.toThrow('has no schedule');
  });
});

describe('pools', () => {
  let app: INestApplicationContext;
  afterEach(() => app?.close());

  it('refuses to boot when a task uses a pool nobody declared', async () => {
    await expect(boot({}, PooledDag)).rejects.toThrow('pooled.extract uses pool warehouse');
  });

  it('runs tasks of a declared pool', async () => {
    const booted = await boot({ pools: { warehouse: 1 } }, PooledDag);
    app = booted.app;
    const runId = await app.get(Airnest).trigger('pooled');
    expect((await settle(app, 'pooled', runId)).state).toBe('success');
  });
});

describe('guards and interceptors', () => {
  let app: INestApplicationContext;
  afterEach(() => app?.close());

  it('apply to tasks when enhancers are on', async () => {
    const booted = await boot({ enhancers: true }, GuardedDag, RequireAllowedParam, DoubleOutput);
    app = booted.app;

    const denied = await app.get(Airnest).trigger('guarded', { logicalDate: new Date('2026-10-01T00:00:00Z') });
    const deniedRun = await settle(app, 'guarded', denied);
    expect(deniedRun.tasks[0]).toMatchObject({ state: 'failed', lastError: 'Forbidden resource' });

    const allowed = await app.get(Airnest).trigger('guarded', {
      logicalDate: new Date('2026-10-02T00:00:00Z'),
      params: { allowed: true },
    });
    expect((await settle(app, 'guarded', allowed)).state).toBe('success');
    expect(await booted.store.outputs(allowed, ['extract'])).toEqual({ extract: 42 });
  });

  it('are ignored when enhancers are off', async () => {
    const booted = await boot({}, GuardedDag, RequireAllowedParam, DoubleOutput);
    app = booted.app;
    const runId = await app.get(Airnest).trigger('guarded');
    expect((await settle(app, 'guarded', runId)).state).toBe('success');
    expect(await booted.store.outputs(runId, ['extract'])).toEqual({ extract: 21 });
  });
});
