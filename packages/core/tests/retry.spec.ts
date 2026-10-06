import { canRetry, retryDelayMs } from '../src/index.js';

const task = { retries: 3, retryDelayMs: 1000, retryBackoff: 'exponential' as const, maxRetryDelayMs: 5000 };

describe('retry', () => {
  it('allows exactly the configured number of retries', () => {
    expect([1, 2, 3, 4].map((tryNumber) => canRetry(task, tryNumber))).toEqual([true, true, true, false]);
  });

  it('doubles the delay, caps it and keeps jitter inside the upper half', () => {
    const delays = [1, 2, 3, 4, 10].map((tryNumber) => retryDelayMs(task, tryNumber, `run-1:load:${tryNumber}`));
    const ceilings = [1000, 2000, 4000, 5000, 5000];
    delays.forEach((delay, i) => {
      expect(delay).toBeGreaterThanOrEqual(ceilings[i] / 2);
      expect(delay).toBeLessThanOrEqual(ceilings[i]);
    });
  });

  it('gives every scheduler the same delay for the same attempt', () => {
    expect(retryDelayMs(task, 2, 'run-1:load:2')).toBe(retryDelayMs(task, 2, 'run-1:load:2'));
  });

  it('keeps the fixed delay untouched', () => {
    expect(retryDelayMs({ ...task, retryBackoff: 'fixed' }, 7, 'any')).toBe(1000);
  });
});
