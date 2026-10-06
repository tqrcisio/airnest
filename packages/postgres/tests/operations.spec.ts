import { InvalidParamsError } from '@airnest/core';
import { TaskStillActiveError } from '../src/index.js';
import { clock, dag, dailyRun, storeWith, task } from './support.js';

type Store = Awaited<ReturnType<typeof storeWith>>['store'];

const lease = 60_000;

async function drain(store: Store, outcome: (taskId: string) => 'succeed' | 'fail' = () => 'succeed') {
  for (;;) {
    await store.advanceRuns(clock.start);
    const claimed = await store.claimTasks('worker', clock.start, lease, 50);
    if (claimed.length === 0) return;
    for (const t of claimed) {
      if (outcome(t.taskId) === 'succeed') await store.succeed(t.attemptId, t.taskId, clock.start);
      else await store.fail(t.attemptId, `${t.taskId} broke`, clock.start);
    }
  }
}

const statesOf = async (store: Store, runId: string) =>
  Object.fromEntries((await store.run(runId))!.tasks.map((t) => [t.taskId, t.state]));

const chain = dag('chain', task('extract'), task('transform', ['extract']), task('load', ['transform']));

describe('clearing a run', () => {
  it('reruns only the failed tasks and what depends on them', async () => {
    const { store } = await storeWith(chain);
    const runId = (await store.createRun(dailyRun('chain'), clock.start))!;
    await drain(store, (taskId) => (taskId === 'transform' ? 'fail' : 'succeed'));
    expect(await statesOf(store, runId)).toEqual({ extract: 'success', transform: 'failed', load: 'upstream_failed' });

    expect(await store.clearRun(runId, { onlyFailed: true, clearedBy: 'ana' }, clock.start)).toEqual([
      'transform',
      'load',
    ]);
    expect((await store.run(runId))!.state).toBe('queued');

    await drain(store);
    expect(await statesOf(store, runId)).toEqual({ extract: 'success', transform: 'success', load: 'success' });
    expect((await store.run(runId))!.state).toBe('success');
    expect((await store.attempts(runId, 'transform')).map((a) => a.tryNumber)).toEqual([1, 2]);
  });

  it('clears a task and its downstream, keeping upstream results', async () => {
    const { store } = await storeWith(chain);
    const runId = (await store.createRun(dailyRun('chain'), clock.start))!;
    await drain(store);

    expect(await store.clearRun(runId, { taskIds: ['transform'] }, clock.start)).toEqual(['transform', 'load']);
    expect(await store.outputs(runId, ['extract'])).toEqual({ extract: 'extract' });
    expect(await store.clearRun(runId, { taskIds: ['transform'], downstream: false }, clock.start)).toEqual([]);
  });

  it('refuses to clear a task that is still running', async () => {
    const { store } = await storeWith(chain);
    const runId = (await store.createRun(dailyRun('chain'), clock.start))!;
    await store.advanceRuns(clock.start);
    await store.claimTasks('worker', clock.start, lease);
    await expect(store.clearRun(runId, {}, clock.start)).rejects.toThrow(TaskStillActiveError);
    await expect(store.clearRun(runId, { taskIds: ['nope'] }, clock.start)).rejects.toThrow('has no task nope');
    expect(await store.clearRun('00000000-0000-0000-0000-000000000000', {}, clock.start)).toBeNull();
  });
});

describe('backfill', () => {
  const hourly = {
    ...dag('hourly', task('extract')),
    schedule: { cron: '0 * * * *', timezone: 'UTC' },
    maxActiveRuns: 2,
  };

  it('creates one run per interval, skips existing ones and respects maxActiveRuns', async () => {
    const { store } = await storeWith(hourly);
    await store.createRun({ ...dailyRun('hourly'), logicalDate: new Date('2026-10-01T01:00:00Z') }, clock.start);

    const { created, skipped } = await store.createBackfill(
      'hourly',
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-10-01T05:00:00Z'),
      { triggeredBy: 'ana' },
      clock.start,
    );
    expect([created.length, skipped]).toEqual([5, 1]);

    await store.advanceRuns(clock.start);
    const runs = await store.runs('hourly', 10);
    expect(runs.filter((run) => run.state === 'running')).toHaveLength(2);
    expect(runs.filter((run) => run.runType === 'backfill').every((run) => run.triggeredBy === 'ana')).toBe(true);
  });
});

describe('params', () => {
  const withParams = {
    ...dag('with_params', task('extract')),
    params: {
      type: 'object',
      properties: { region: { type: 'string', default: 'north' }, limit: { type: 'number' } },
      additionalProperties: false,
    },
  };

  it('stores defaults on every run and rejects invalid ones', async () => {
    const { store } = await storeWith(withParams);
    const runId = (await store.createRun({ ...dailyRun('with_params'), params: { limit: 5 } }, clock.start))!;
    await store.advanceRuns(clock.start);
    const [claimed] = await store.claimTasks('worker', clock.start, lease);
    expect(claimed.params).toEqual({ limit: 5, region: 'north' });
    expect(runId).toBeTruthy();

    await expect(
      store.createRun({ ...dailyRun('with_params', '2026-10-07'), params: { limit: 'many' } }, clock.start),
    ).rejects.toThrow(InvalidParamsError);
  });
});

describe('pools', () => {
  it('never runs more tasks of a pool than it has slots', async () => {
    const wide = dag(
      'wide',
      ...Array.from({ length: 6 }, (_, i) => task(`db_${i}`, [], { pool: 'database' })),
      task('free'),
    );
    const { store } = await storeWith(wide);
    await store.upsertPools({ database: { slots: 2, description: 'source database' } }, clock.start);
    await store.createRun(dailyRun('wide'), clock.start);
    await store.advanceRuns(clock.start);

    const first = await store.claimTasks('worker', clock.start, lease, 10);
    expect(first.map((t) => t.taskId).sort()).toEqual(['db_0', 'db_1', 'free']);
    expect(await store.claimTasks('worker', clock.start, lease, 10)).toEqual([]);
    expect(await store.pools()).toEqual([
      { name: 'database', slots: 2, description: 'source database', running: 2, queued: 4 },
    ]);

    await store.succeed(first.find((t) => t.taskId === 'db_0')!.attemptId, null, clock.start);
    expect((await store.claimTasks('worker', clock.start, lease, 10)).map((t) => t.taskId)).toEqual(['db_2']);
  });

  it('holds tasks of an undeclared pool', async () => {
    const { store } = await storeWith(dag('orphan', task('extract', [], { pool: 'missing' })));
    await store.createRun(dailyRun('orphan'), clock.start);
    await store.advanceRuns(clock.start);
    expect(await store.claimTasks('worker', clock.start, lease, 10)).toEqual([]);
  });
});

describe('logs and retention', () => {
  it('pages through task logs by sequence', async () => {
    const { store } = await storeWith(chain);
    const runId = (await store.createRun(dailyRun('chain'), clock.start))!;
    await store.appendLogs(
      ['connecting', 'fetched 3 rows', 'slow query'].map((message, i) => ({
        runId,
        taskId: 'extract',
        tryNumber: 1,
        level: i === 2 ? 'warn' : 'log',
        message,
        at: clock.after(i),
      })),
    );
    const all = await store.logs(runId, 'extract');
    expect(all.map((line) => [line.level, line.message])).toEqual([
      ['log', 'connecting'],
      ['log', 'fetched 3 rows'],
      ['warn', 'slow query'],
    ]);
    expect((await store.logs(runId, 'extract', all[1].seq)).map((line) => line.message)).toEqual(['slow query']);
  });

  it('purges finished runs older than the cutoff with everything attached to them', async () => {
    const { db, store } = await storeWith(chain);
    const oldRun = (await store.createRun(dailyRun('chain', '2026-09-01'), clock.start))!;
    await drain(store);
    const running = (await store.createRun(dailyRun('chain', '2026-08-01'), clock.start))!;

    expect(await store.purgeRunsBefore(clock.after(1))).toBe(1);
    expect(await store.run(oldRun)).toBeNull();
    expect(await store.run(running)).not.toBeNull();
    const { rows } = await db.query<{ count: number }>('select count(*)::int as count from airnest.task_attempt');
    expect(rows[0].count).toBe(0);
  });
});
