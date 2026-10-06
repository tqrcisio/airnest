import { migrate } from '../src/index.js';
import { clock, dag, dailyRun, storeWith, task } from './support.js';

const diamond = dag(
  'diamond',
  task('extract'),
  task('left', ['extract']),
  task('right', ['extract']),
  task('load', ['left', 'right']),
);

const lease = 60_000;

describe('PostgresDagStore', () => {
  it('migrates idempotently', async () => {
    const { db } = await storeWith();
    await migrate(db);
    const { rows } = await db.query<{ version: number }>('select version from airnest.migration');
    expect(rows).toEqual([{ version: 1 }, { version: 2 }]);
  });

  it('creates one run per logical date', async () => {
    const { store } = await storeWith(diamond);
    expect(await store.createRun(dailyRun('diamond'), clock.start)).toMatch(/^[0-9a-f-]{36}$/);
    expect(await store.createRun(dailyRun('diamond'), clock.start)).toBeNull();
  });

  it('drives a diamond run from queue to success, passing outputs downstream', async () => {
    const { store } = await storeWith(diamond);
    const runId = (await store.createRun(dailyRun('diamond'), clock.start))!;

    const runTo = async (expected: string[], output: (taskId: string) => unknown) => {
      expect((await store.advanceRuns(clock.start)).queued).toBe(expected.length);
      const claimed = await store.claimTasks('worker-1', clock.start, lease, 10);
      expect(claimed.map((t) => t.taskId).sort()).toEqual(expected);
      for (const t of claimed) expect(await store.succeed(t.attemptId, output(t.taskId), clock.start)).toBe(true);
      return claimed;
    };

    const [extract] = await runTo(['extract'], () => [1, 2, 3]);
    expect(extract).toMatchObject({ dagId: 'diamond', tryNumber: 1, params: {}, runId });
    await runTo(['left', 'right'], (taskId) => ({ side: taskId }));
    expect(await store.outputs(runId, ['left', 'right'])).toEqual({ left: { side: 'left' }, right: { side: 'right' } });
    await runTo(['load'], () => undefined);

    expect(await store.advanceRuns(clock.start)).toEqual({
      queued: 0,
      finished: [{ runId, dagId: 'diamond', state: 'success', reason: undefined }],
    });
  });

  it('retries with the configured delay, then fails the run and its downstream', async () => {
    const flaky = dag('flaky', task('extract', [], { retries: 1, retryDelayMs: 1000 }), task('load', ['extract']));
    const { db, store } = await storeWith(flaky);
    const runId = (await store.createRun(dailyRun('flaky'), clock.start))!;

    await store.advanceRuns(clock.start);
    const [first] = await store.claimTasks('worker-1', clock.start, lease);
    expect(await store.fail(first.attemptId, 'gateway timeout', clock.start)).toBe(true);

    expect((await store.advanceRuns(clock.after(999))).queued).toBe(0);
    expect((await store.advanceRuns(clock.after(1000))).queued).toBe(1);
    const [second] = await store.claimTasks('worker-2', clock.after(1000), lease);
    expect(second.tryNumber).toBe(2);
    await store.fail(second.attemptId, 'gateway timeout again', clock.after(1000));

    const { finished } = await store.advanceRuns(clock.after(1000));
    expect(finished).toEqual([{ runId, dagId: 'flaky', state: 'failed', reason: 'a final task failed' }]);

    const { rows: tasks } = await db.query('select task_id, state, reason from airnest.task_instance order by task_id');
    expect(tasks).toEqual([
      { task_id: 'extract', state: 'failed', reason: null },
      { task_id: 'load', state: 'upstream_failed', reason: '1 upstream task failed' },
    ]);
    const { rows: attempts } = await db.query(
      'select try_number, worker_id, state, error from airnest.task_attempt order by try_number',
    );
    expect(attempts).toEqual([
      { try_number: 1, worker_id: 'worker-1', state: 'up_for_retry', error: 'gateway timeout' },
      { try_number: 2, worker_id: 'worker-2', state: 'failed', error: 'gateway timeout again' },
    ]);
  });

  it('reaps a task whose worker stopped renewing the lease and ignores the zombie afterwards', async () => {
    const { store } = await storeWith(dag('single', task('extract', [], { retries: 1, retryDelayMs: 0 })));
    await store.createRun(dailyRun('single'), clock.start);
    await store.advanceRuns(clock.start);
    const [zombie] = await store.claimTasks('worker-1', clock.start, 1000);

    expect(await store.heartbeat(zombie.attemptId, clock.after(500), 1000)).toBe(true);
    expect(await store.reapExpiredLeases(clock.after(1400))).toBe(0);
    expect(await store.reapExpiredLeases(clock.after(1600))).toBe(1);

    expect(await store.succeed(zombie.attemptId, 'late', clock.after(1700))).toBe(false);
    expect(await store.heartbeat(zombie.attemptId, clock.after(1700), 1000)).toBe(false);

    await store.advanceRuns(clock.after(1700));
    const [retry] = await store.claimTasks('worker-2', clock.after(1700), lease);
    expect(retry.tryNumber).toBe(2);
    expect(retry.attemptId).not.toBe(zombie.attemptId);
  });

  it('never hands the same task to two workers', async () => {
    const wide = dag('wide', ...Array.from({ length: 20 }, (_, i) => task(`part_${i}`)));
    const { store } = await storeWith(wide);
    await store.createRun(dailyRun('wide'), clock.start);
    await store.advanceRuns(clock.start);

    const batches = await Promise.all(
      Array.from({ length: 5 }, (_, i) => store.claimTasks(`worker-${i}`, clock.start, lease, 6)),
    );
    const claimed = batches.flat().map((t) => t.taskId);
    expect(claimed).toHaveLength(20);
    expect(new Set(claimed).size).toBe(20);
  });
});
