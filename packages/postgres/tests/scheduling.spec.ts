import { hashDag } from '@airnest/core';
import { clock, dag, storeWith, task } from './support.js';

const daily = (catchup: boolean, maxActiveRuns: number) => ({
  ...dag('daily', task('extract')),
  schedule: { cron: '0 3 * * *', timezone: 'America/Sao_Paulo' },
  startDate: '2026-10-01T00:00:00.000Z',
  catchup,
  maxActiveRuns,
});

const days = (report: { created: { logicalDate: Date }[] }) =>
  report.created.map((run) => run.logicalDate.toISOString().slice(0, 10));

describe('createDueRuns', () => {
  it('catches up missed intervals without exceeding maxActiveRuns', async () => {
    const { store } = await storeWith(daily(true, 2));

    expect(days(await store.createDueRuns(clock.start))).toEqual(['2026-10-01', '2026-10-02']);
    expect(days(await store.createDueRuns(clock.start))).toEqual([]);

    for (;;) {
      await store.advanceRuns(clock.start);
      const claimed = await store.claimTasks('worker', clock.start, 60_000, 10);
      if (claimed.length === 0) break;
      for (const t of claimed) await store.succeed(t.attemptId, null, clock.start);
    }
    expect(days(await store.createDueRuns(clock.start))).toEqual(['2026-10-03', '2026-10-04']);
  });

  it('creates only the latest interval when catchup is off, then waits for the next fire', async () => {
    const { store } = await storeWith(daily(false, 16));

    expect(days(await store.createDueRuns(clock.start))).toEqual(['2026-10-06']);
    expect(days(await store.createDueRuns(clock.after(60 * 60_000)))).toEqual([]);
    expect(days(await store.createDueRuns(new Date('2026-10-07T06:00:00Z')))).toEqual(['2026-10-07']);
  });

  it('reschedules from the last run when a new version changes the cron', async () => {
    const { store } = await storeWith(daily(false, 16));
    await store.createDueRuns(clock.start);

    const hourly = { ...daily(false, 16), schedule: { cron: '0 * * * *', timezone: 'UTC' } };
    await store.registerDag(hourly, hashDag(hourly), clock.after(30 * 60_000));
    expect(days(await store.createDueRuns(clock.after(30 * 60_000)))).toEqual([]);
    const report = await store.createDueRuns(clock.after(60 * 60_000));
    expect(report.created.map((run) => run.logicalDate.toISOString())).toEqual(['2026-10-06T07:00:00.000Z']);
  });

  it('never schedules a DAG without a cron', async () => {
    const { store } = await storeWith(dag('manual_only', task('extract')));
    expect(await store.createDueRuns(clock.after(365 * 86_400_000))).toEqual({ created: [], stalled: [] });
  });
});
