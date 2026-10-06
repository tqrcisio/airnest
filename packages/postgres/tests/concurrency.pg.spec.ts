import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashDag } from '@airnest/core';
import { fromPgPool, migrate, PostgresDagStore } from '../src/index.js';
import { clock, dag, dailyRun, task } from './support.js';

const serverUrl = process.env.SQL_TEST_PG_URL;

describe.skipIf(!serverUrl)('PostgresDagStore on a real PostgreSQL server', () => {
  const database = `airnest_test_${randomUUID().slice(0, 8)}`;
  const admin = new pg.Pool({ connectionString: serverUrl, max: 1 });
  let pool: pg.Pool;
  let store: PostgresDagStore;

  beforeAll(async () => {
    await admin.query(`create database ${database}`);
    const url = new URL(serverUrl!);
    url.pathname = `/${database}`;
    pool = new pg.Pool({ connectionString: url.toString(), max: 20 });
    const db = fromPgPool(pool);
    await Promise.all([migrate(db), migrate(db), migrate(db)]);
    store = new PostgresDagStore(db);
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`drop database if exists ${database}`);
    await admin.end();
  });

  it('spreads every queued task across competing workers exactly once', async () => {
    const wide = dag('wide', ...Array.from({ length: 200 }, (_, i) => task(`part_${i}`)));
    await store.registerDag(wide, hashDag(wide), clock.start);
    await store.createRun(dailyRun('wide'), clock.start);
    await store.advanceRuns(clock.start);

    const drain = async (workerId: string) => {
      const mine: string[] = [];
      for (;;) {
        const batch = await store.claimTasks(workerId, clock.start, 60_000, 3);
        if (batch.length === 0) return mine;
        mine.push(...batch.map((t) => t.taskId));
      }
    };
    const perWorker = await Promise.all(Array.from({ length: 8 }, (_, i) => drain(`worker-${i}`)));
    const claimed = perWorker.flat();

    expect(claimed).toHaveLength(200);
    expect(new Set(claimed).size).toBe(200);
    expect(perWorker.filter((tasks) => tasks.length > 0).length).toBeGreaterThan(1);
  });

  it('lets several schedulers advance the same runs without queueing a task twice', async () => {
    const chain = dag('chain', task('extract'), task('load', ['extract']));
    await store.registerDag(chain, hashDag(chain), clock.start);
    const days = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    for (const day of days) await store.createRun(dailyRun('chain', day), clock.start);

    const reports = await Promise.all(Array.from({ length: 4 }, () => store.advanceRuns(clock.start, 30)));
    expect(reports.reduce((sum, report) => sum + report.queued, 0)).toBe(30);

    const claimed = await store.claimTasks('worker', clock.start, 60_000, 100);
    expect(claimed.filter((t) => t.dagId === 'chain').map((t) => t.taskId)).toEqual(Array(30).fill('extract'));
  });

  it('accepts exactly one outcome when a reaper and a slow worker race on the same attempt', async () => {
    const single = dag('race', task('extract', [], { retries: 3, retryDelayMs: 0 }));
    await store.registerDag(single, hashDag(single), clock.start);
    for (let i = 1; i <= 20; i++)
      await store.createRun(dailyRun('race', `2026-08-${String(i).padStart(2, '0')}`), clock.start);
    await store.advanceRuns(clock.start, 100);
    const attempts = (await store.claimTasks('slow', clock.start, 1000, 100)).filter((t) => t.dagId === 'race');

    const late = clock.after(5000);
    const outcomes = await Promise.all(
      attempts.flatMap((attempt) => [
        store.succeed(attempt.attemptId, 'done', late),
        store.fail(attempt.attemptId, 'reaped', late),
      ]),
    );
    for (let i = 0; i < attempts.length; i++) expect(outcomes[2 * i] !== outcomes[2 * i + 1]).toBe(true);
  });

  it('keeps a pool within its slots while workers compete', async () => {
    const pooled = dag('pooled', ...Array.from({ length: 40 }, (_, i) => task(`db_${i}`, [], { pool: 'warehouse' })));
    await store.registerDag(pooled, hashDag(pooled), clock.start);
    await store.upsertPools({ warehouse: 3 }, clock.start);
    await store.createRun(dailyRun('pooled'), clock.start);
    await store.advanceRuns(clock.start, 100);

    let peak = 0;
    let running = 0;
    const work = async (workerId: string) => {
      for (;;) {
        const [claimed] = await store.claimTasks(workerId, clock.start, 60_000, 1);
        if (!claimed) {
          const [pool] = await store.pools();
          if (pool.queued === 0) return;
          continue;
        }
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        await store.succeed(claimed.attemptId, null, clock.start);
      }
    };
    await Promise.all(Array.from({ length: 8 }, (_, i) => work(`worker-${i}`)));
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });
});
