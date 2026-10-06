import { defineDag, planRun } from '../src/index.js';

const noop = () => undefined;

const { definition: diamond } = defineDag({ id: 'diamond' }, (dag) => {
  const extract = dag.task('extract', noop);
  const left = dag.task('left', { after: [extract] }, noop);
  const right = dag.task('right', { after: [extract] }, noop);
  dag.task('load', { after: [left, right] }, noop);
});

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
    const { definition } = defineDag({ id: 'with_cleanup' }, (dag) => {
      const load = dag.task('load', noop);
      dag.task('notify_failure', { after: [load], triggerRule: 'one_failed' }, noop);
    });
    expect(planRun(definition, { load: 'success' }).skip.map((d) => d.taskId)).toEqual(['notify_failure']);
    expect(planRun(definition, { load: 'success', notify_failure: 'skipped' }).runState).toBe('success');
  });
});
