import { evaluateTriggerRule, type TaskState } from '../src/index.js';

const outcome = (rule: Parameters<typeof evaluateTriggerRule>[0], upstream: TaskState[]) =>
  evaluateTriggerRule(rule, upstream).outcome;

describe('evaluateTriggerRule', () => {
  it('starts root tasks whatever the rule', () => {
    expect(outcome('one_failed', [])).toBe('ready');
  });

  it.each([
    ['all_success', ['success', 'success'], 'ready'],
    ['all_success', ['success', 'running'], 'waiting'],
    ['all_success', ['running', 'failed'], 'upstream_failed'],
    ['all_success', ['success', 'skipped'], 'skipped'],
    ['all_failed', ['failed', 'upstream_failed'], 'ready'],
    ['all_failed', ['failed', 'success'], 'skipped'],
    ['all_done', ['failed', 'skipped'], 'ready'],
    ['all_done', ['failed', 'queued'], 'waiting'],
    ['one_success', ['success', 'running'], 'ready'],
    ['one_success', ['failed', 'skipped'], 'upstream_failed'],
    ['one_success', ['skipped', 'skipped'], 'skipped'],
    ['one_failed', ['running', 'failed'], 'ready'],
    ['one_failed', ['success', 'skipped'], 'skipped'],
    ['none_failed', ['success', 'skipped'], 'ready'],
    ['none_failed', ['upstream_failed', 'running'], 'upstream_failed'],
    ['none_failed_min_one_success', ['success', 'skipped'], 'ready'],
    ['none_failed_min_one_success', ['skipped', 'skipped'], 'skipped'],
    ['always', ['failed', 'running'], 'ready'],
  ] as const)('%s with %j is %s', (rule, upstream, expected) => {
    expect(outcome(rule, [...upstream])).toBe(expected);
  });
});
