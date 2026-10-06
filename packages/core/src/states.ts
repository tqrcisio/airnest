export const taskStates = [
  'pending',
  'scheduled',
  'queued',
  'running',
  'deferred',
  'up_for_retry',
  'success',
  'failed',
  'upstream_failed',
  'skipped',
  'removed',
] as const;

export type TaskState = (typeof taskStates)[number];

export const runStates = ['queued', 'running', 'success', 'failed'] as const;

export type RunState = (typeof runStates)[number];

const finishedTaskStates = new Set<TaskState>(['success', 'failed', 'upstream_failed', 'skipped', 'removed']);

export function isFinished(state: TaskState) {
  return finishedTaskStates.has(state);
}

export function isFailure(state: TaskState) {
  return state === 'failed' || state === 'upstream_failed';
}

const allowedTaskTransitions: Record<TaskState, readonly TaskState[]> = {
  pending: ['scheduled', 'upstream_failed', 'skipped', 'removed'],
  scheduled: ['queued', 'pending', 'upstream_failed', 'skipped', 'removed'],
  queued: ['running', 'scheduled', 'failed'],
  running: ['success', 'failed', 'up_for_retry', 'deferred', 'skipped'],
  deferred: ['scheduled', 'failed'],
  up_for_retry: ['scheduled', 'failed'],
  success: ['pending'],
  failed: ['pending'],
  upstream_failed: ['pending'],
  skipped: ['pending'],
  removed: ['pending'],
};

export function canTransition(from: TaskState, to: TaskState) {
  return allowedTaskTransitions[from].includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: TaskState,
    readonly to: TaskState,
  ) {
    super(`Task cannot go from ${from} to ${to}`);
  }
}

export function assertTransition(from: TaskState, to: TaskState) {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}
