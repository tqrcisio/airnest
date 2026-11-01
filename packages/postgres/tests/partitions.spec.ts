import { hashDag } from '@airnest/core';
import { UnknownPartitionError } from '../src/index.js';
import { clock, dag, storeWith, task } from './support.js';

const hourlyPerTenant = {
  ...dag('catalog', task('products'), task('prices', ['products'])),
  schedule: { cron: '0 * * * *', timezone: 'UTC' },
  startDate: '2026-10-06T00:00:00.000Z',
  maxActiveRuns: 1,
  partitioned: true,
};

const tenants = (report: { created: { partitionKey: string }[] }) =>
  report.created.map((run) => run.partitionKey).sort();

async function finishAll(store: Awaited<ReturnType<typeof storeWith>>['store'], now: Date) {
  for (;;) {
    await store.advanceRuns(now);
    const claimed = await store.claimTasks('worker', now, 60_000, 10);
    if (claimed.length === 0) break;
    for (const claim of claimed) await store.succeed(claim.attemptId, null, now);
  }
  await store.advanceRuns(now);
}

describe('partitions', () => {
  it('schedules nothing until partitions are synced, then one run per partition', async () => {
    const { store } = await storeWith(hourlyPerTenant);
    expect(tenants(await store.createDueRuns(clock.start))).toEqual([]);

    const sync = await store.syncPartitions('catalog', [{ key: 't1', label: 'Loja 1' }, { key: 't2' }], clock.start);
    expect(sync).toEqual({ activated: ['t1', 't2'], deactivated: [] });
    expect(tenants(await store.createDueRuns(clock.start))).toEqual(['t1', 't2']);
    expect(tenants(await store.createDueRuns(clock.start))).toEqual([]);
  });

  it('limits active runs per partition, not per DAG', async () => {
    const { store } = await storeWith(hourlyPerTenant);
    await store.syncPartitions('catalog', [{ key: 't1' }, { key: 't2' }], clock.start);
    await store.createDueRuns(clock.start);
    await store.advanceRuns(clock.start);

    const claimed = await store.claimTasks('worker', clock.start, 60_000, 10);
    expect(claimed.map((claim) => claim.partitionKey).sort()).toEqual(['t1', 't2']);
  });

  it('keeps each partition on its own timetable', async () => {
    const { store } = await storeWith(hourlyPerTenant);
    await store.syncPartitions('catalog', [{ key: 't1' }], clock.start);
    await store.createDueRuns(clock.start);
    await finishAll(store, clock.start);

    const anHourLater = clock.after(60 * 60_000);
    await store.syncPartitions('catalog', [{ key: 't1' }, { key: 't2' }], anHourLater);
    const report = await store.createDueRuns(anHourLater);
    expect(report.created.map((run) => [run.partitionKey, run.logicalDate.toISOString()]).sort()).toEqual([
      ['t1', '2026-10-06T07:00:00.000Z'],
      ['t2', '2026-10-06T07:00:00.000Z'],
    ]);
  });

  it('stops scheduling a removed partition and resumes from its last run when it comes back', async () => {
    const { store } = await storeWith(hourlyPerTenant);
    await store.syncPartitions('catalog', [{ key: 't1' }, { key: 't2' }], clock.start);
    await store.createDueRuns(clock.start);
    await finishAll(store, clock.start);

    expect(await store.syncPartitions('catalog', [{ key: 't1' }], clock.after(60_000))).toEqual({
      activated: [],
      deactivated: ['t2'],
    });
    expect(tenants(await store.createDueRuns(clock.after(60 * 60_000)))).toEqual(['t1']);
    expect((await store.partitions('catalog')).map((partition) => partition.key)).toEqual(['t1']);

    const back = await store.syncPartitions('catalog', [{ key: 't1' }, { key: 't2' }], clock.after(61 * 60_000));
    expect(back.activated).toEqual(['t2']);
    expect(tenants(await store.createDueRuns(clock.after(61 * 60_000)))).toEqual(['t2']);
  });

  it('refuses manual runs and backfills for a partition that is not active', async () => {
    const { store } = await storeWith(hourlyPerTenant);
    await store.syncPartitions('catalog', [{ key: 't1' }], clock.start);
    const manual = (partitionKey?: string) =>
      store.createRun(
        {
          dagId: 'catalog',
          partitionKey,
          logicalDate: clock.start,
          dataInterval: { start: clock.start, end: clock.start },
          runType: 'manual',
        },
        clock.start,
      );

    await expect(manual()).rejects.toBeInstanceOf(UnknownPartitionError);
    await expect(manual('t9')).rejects.toBeInstanceOf(UnknownPartitionError);
    expect(await manual('t1')).toEqual(expect.any(String));
    await expect(
      store.createBackfill('catalog', clock.start, clock.after(60 * 60_000), { partitionKey: 't9' }, clock.start),
    ).rejects.toBeInstanceOf(UnknownPartitionError);
  });

  it('backfills every active partition when none is named', async () => {
    const { store } = await storeWith(hourlyPerTenant);
    await store.syncPartitions('catalog', [{ key: 't1' }, { key: 't2' }], clock.start);
    const { created } = await store.createBackfill(
      'catalog',
      new Date('2026-10-05T00:00:00Z'),
      new Date('2026-10-05T02:00:00Z'),
      {},
      clock.start,
    );
    expect(created).toHaveLength(6);
    expect((await store.runs('catalog', 25, 't2')).every((run) => run.partitionKey === 't2')).toBe(true);
  });

  it('lists active partitions with labels on the DAG summary', async () => {
    const { store } = await storeWith(hourlyPerTenant);
    await store.syncPartitions(
      'catalog',
      [
        { key: 't2', label: 'Loja B' },
        { key: 't1', label: 'Loja A' },
      ],
      clock.start,
    );
    const [summary] = await store.dags('catalog');
    expect(summary.partitions).toEqual([
      { key: 't1', label: 'Loja A' },
      { key: 't2', label: 'Loja B' },
    ]);
    expect(summary.nextRunAfter).toEqual(clock.start);
  });

  it('keeps unpartitioned DAGs scheduling exactly as before', async () => {
    const daily = {
      ...dag('daily', task('extract')),
      schedule: { cron: '0 6 * * *', timezone: 'UTC' },
      startDate: '2026-10-01T00:00:00.000Z',
    };
    const { store } = await storeWith(daily);
    const report = await store.createDueRuns(clock.start);
    expect(report.created.map((run) => [run.partitionKey, run.logicalDate.toISOString()])).toEqual([
      ['', '2026-10-06T06:00:00.000Z'],
    ]);
    await expect(store.syncPartitions('daily', [{ key: 't1' }], clock.start)).rejects.toThrow('not partitioned');
  });

  it('retires the default partition when a DAG becomes partitioned', async () => {
    const plain = { ...hourlyPerTenant, partitioned: undefined };
    const { store } = await storeWith(plain);
    await store.registerDag(hourlyPerTenant, hashDag(hourlyPerTenant), clock.start);
    expect(tenants(await store.createDueRuns(clock.start))).toEqual([]);
  });
});
