import { createHash } from 'node:crypto';
import type { TaskDefinition } from './definition.js';

type RetrySettings = Pick<TaskDefinition, 'retries' | 'retryDelayMs' | 'retryBackoff' | 'maxRetryDelayMs'>;

export function canRetry(task: RetrySettings, failedTryNumber: number) {
  return failedTryNumber <= task.retries;
}

function stableFraction(key: string) {
  return createHash('sha256').update(key).digest().readUInt32BE(0) / 2 ** 32;
}

export function retryDelayMs(task: RetrySettings, failedTryNumber: number, jitterKey: string) {
  if (task.retryBackoff === 'fixed') return task.retryDelayMs;

  const ceiling = Math.min(task.maxRetryDelayMs, task.retryDelayMs * 2 ** (failedTryNumber - 1));
  const floor = ceiling / 2;
  return Math.round(floor + stableFraction(jitterKey) * floor);
}
