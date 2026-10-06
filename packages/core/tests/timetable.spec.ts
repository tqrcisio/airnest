import { nextScheduledRun } from '../src/index.js';

const daily = {
  id: 'sales_daily',
  schedule: { cron: '0 3 * * *', timezone: 'America/Sao_Paulo' },
  startDate: '2026-10-01T00:00:00.000Z',
  catchup: true,
};

const at = (iso: string) => new Date(iso);

describe('nextScheduledRun', () => {
  it('starts at the first fire after startDate, in the DAG timezone', () => {
    const run = nextScheduledRun(daily, null, at('2026-10-06T12:00:00Z'))!;
    expect(run.logicalDate.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(run.dataInterval.start.toISOString()).toBe('2026-09-30T06:00:00.000Z');
  });

  it('walks every missed interval when catchup is on', () => {
    const run = nextScheduledRun(daily, at('2026-10-01T06:00:00Z'), at('2026-10-06T12:00:00Z'))!;
    expect(run.logicalDate.toISOString()).toBe('2026-10-02T06:00:00.000Z');
  });

  it('jumps to the latest interval when catchup is off', () => {
    const run = nextScheduledRun({ ...daily, catchup: false }, at('2026-10-01T06:00:00Z'), at('2026-10-06T12:00:00Z'))!;
    expect(run.logicalDate.toISOString()).toBe('2026-10-06T06:00:00.000Z');
    expect(run.dataInterval.start.toISOString()).toBe('2026-10-05T06:00:00.000Z');
  });

  it('returns a future fire when nothing is due yet', () => {
    const run = nextScheduledRun(daily, at('2026-10-06T06:00:00Z'), at('2026-10-06T12:00:00Z'))!;
    expect(run.logicalDate.toISOString()).toBe('2026-10-07T06:00:00.000Z');
  });

  it('has nothing to schedule for a manual-only DAG', () => {
    expect(nextScheduledRun({ ...daily, schedule: null }, null, new Date())).toBeNull();
  });
});
