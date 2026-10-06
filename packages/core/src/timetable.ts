import { Cron } from 'croner';
import type { DagDefinition } from './definition.js';
import type { DataInterval } from './context.js';

export type ScheduledRun = {
  logicalDate: Date;
  dataInterval: DataInterval;
};

export class ScheduleStalledError extends Error {
  constructor(
    readonly dagId: string,
    readonly last: Date,
    readonly next: Date,
  ) {
    super(`Schedule of ${dagId} did not move forward: ${next.toISOString()} is not after ${last.toISOString()}`);
  }
}

const croneTruncatesToSeconds = 1000;

function latestFireAtOrBefore(cron: Cron, instant: Date) {
  return cron.previousRuns(1, new Date(instant.getTime() + croneTruncatesToSeconds))[0] ?? null;
}

function firstFireAtOrAfter(cron: Cron, instant: Date) {
  return cron.nextRun(new Date(instant.getTime() - croneTruncatesToSeconds));
}

export function nextScheduledRun(
  dag: Pick<DagDefinition, 'id' | 'schedule' | 'startDate' | 'catchup'>,
  lastLogicalDate: Date | null,
  now: Date,
): ScheduledRun | null {
  if (!dag.schedule) return null;
  const cron = new Cron(dag.schedule.cron, { timezone: dag.schedule.timezone });

  let next: Date | null;
  if (lastLogicalDate) next = cron.nextRun(lastLogicalDate);
  else if (dag.startDate) next = firstFireAtOrAfter(cron, new Date(dag.startDate));
  else next = cron.nextRun(now);
  if (!next) return null;

  if (!dag.catchup) {
    const latest = latestFireAtOrBefore(cron, now);
    if (latest && latest > next) next = latest;
  }
  if (lastLogicalDate && next <= lastLogicalDate) throw new ScheduleStalledError(dag.id, lastLogicalDate, next);

  const intervalStart = cron.previousRuns(1, next)[0] ?? next;
  return { logicalDate: next, dataInterval: { start: intervalStart, end: next } };
}

export const maxBackfillRuns = 1000;

export function scheduledRunsBetween(
  dag: Pick<DagDefinition, 'id' | 'schedule'>,
  from: Date,
  to: Date,
): ScheduledRun[] {
  if (!dag.schedule) throw new Error(`DAG ${dag.id} has no schedule to backfill`);
  const cron = new Cron(dag.schedule.cron, { timezone: dag.schedule.timezone });
  const runs: ScheduledRun[] = [];
  for (let fire = firstFireAtOrAfter(cron, from); fire && fire <= to; fire = cron.nextRun(fire)) {
    if (runs.length === maxBackfillRuns) {
      throw new Error(`A backfill of ${dag.id} is limited to ${maxBackfillRuns} runs; narrow the range`);
    }
    const start = cron.previousRuns(1, fire)[0] ?? fire;
    runs.push({ logicalDate: fire, dataInterval: { start, end: fire } });
  }
  return runs;
}
