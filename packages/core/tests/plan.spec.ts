import { planRun } from '../src/index.js';
import { dag, task } from './support.js';

const diamond = dag(
  'diamond',
  task('extract'),
  task('left', ['extract']),
  task('right', ['extract']),
  task('load', ['left', 'right']),
);

describe('planRun', () => {
  it('schedules only the root of a fresh run', () => {
    const plan = planRun(diamond, {});
    expect(plan.schedule).toEqual(['extract']);
    expect(plan.runState).toBe('running');
  });

  it('fans out once the root succeeds', () => {
    expect(planRun(diamond, { extract: 'success' }).schedule).toEqual(['left', 'right']);
  });

  it('waits on fan-in while one branch is still running', () => {
    const plan = planRun(diamond, { extract: 'success', left: 'success', right: 'running' });
    expect(plan.schedule).toEqual([]);
    expect(plan.waiting).toEqual([{ taskId: 'load', reason: '1 of 2 upstream tasks still running' }]);
  });

  it('propagates a failure through the whole downstream in one pass', () => {
    const plan = planRun(diamond, { extract: 'failed' });
    expect(plan.upstreamFailed.map((d) => d.taskId)).toEqual(['left', 'right', 'load']);
    expect(plan.runState).toBe('failed');
  });

  it('succeeds when a failure is handled by a downstream cleanup', () => {
    const withCleanup = dag(
      'with_cleanup',
      task('load'),
      task('notify_failure', ['load'], { triggerRule: 'one_failed' }),
    );
    expect(planRun(withCleanup, { load: 'success' }).skip.map((d) => d.taskId)).toEqual(['notify_failure']);
    expect(planRun(withCleanup, { load: 'success', notify_failure: 'skipped' }).runState).toBe('success');
  });
});
