import type { TaskState } from './states.js';

export const triggerRules = [
  'all_success',
  'all_failed',
  'all_done',
  'one_success',
  'one_failed',
  'none_failed',
  'none_failed_min_one_success',
  'always',
] as const;

export type TriggerRule = (typeof triggerRules)[number];

export type TriggerVerdict =
  | { outcome: 'ready' }
  | { outcome: 'waiting'; reason: string }
  | { outcome: 'upstream_failed'; reason: string }
  | { outcome: 'skipped'; reason: string };

type UpstreamTally = {
  total: number;
  done: number;
  success: number;
  failed: number;
  skipped: number;
};

function tally(upstream: readonly TaskState[]): UpstreamTally {
  const count = (...states: TaskState[]) => upstream.filter((state) => states.includes(state)).length;
  const success = count('success');
  const failed = count('failed', 'upstream_failed');
  const skipped = count('skipped', 'removed');
  return { total: upstream.length, done: success + failed + skipped, success, failed, skipped };
}

const ready: TriggerVerdict = { outcome: 'ready' };

function waiting(t: UpstreamTally): TriggerVerdict {
  return { outcome: 'waiting', reason: `${t.total - t.done} of ${t.total} upstream tasks still running` };
}

export function evaluateTriggerRule(rule: TriggerRule, upstream: readonly TaskState[]): TriggerVerdict {
  if (upstream.length === 0 || rule === 'always') return ready;

  const t = tally(upstream);
  const allDone = t.done === t.total;

  switch (rule) {
    case 'all_success':
      if (t.failed > 0) return { outcome: 'upstream_failed', reason: `${t.failed} upstream tasks failed` };
      if (t.skipped > 0) return { outcome: 'skipped', reason: `${t.skipped} upstream tasks were skipped` };
      return allDone ? ready : waiting(t);

    case 'all_failed':
      if (t.success + t.skipped > 0) return { outcome: 'skipped', reason: 'an upstream task did not fail' };
      return allDone ? ready : waiting(t);

    case 'all_done':
      return allDone ? ready : waiting(t);

    case 'one_success':
      if (t.success > 0) return ready;
      if (!allDone) return waiting(t);
      return t.skipped === t.total
        ? { outcome: 'skipped', reason: 'every upstream task was skipped' }
        : { outcome: 'upstream_failed', reason: 'no upstream task succeeded' };

    case 'one_failed':
      if (t.failed > 0) return ready;
      return allDone ? { outcome: 'skipped', reason: 'no upstream task failed' } : waiting(t);

    case 'none_failed':
      if (t.failed > 0) return { outcome: 'upstream_failed', reason: `${t.failed} upstream tasks failed` };
      return allDone ? ready : waiting(t);

    case 'none_failed_min_one_success':
      if (t.failed > 0) return { outcome: 'upstream_failed', reason: `${t.failed} upstream tasks failed` };
      if (!allDone) return waiting(t);
      return t.success > 0 ? ready : { outcome: 'skipped', reason: 'every upstream task was skipped' };
  }
}
