import { topologicalOrder, type DagDefinition } from './definition.js';
import { isFailure, isFinished, type RunState, type TaskState } from './states.js';
import { evaluateTriggerRule } from './trigger-rules.js';

export type TaskDecision = { taskId: string; reason: string };

export type RunPlan = {
  schedule: string[];
  upstreamFailed: TaskDecision[];
  skip: TaskDecision[];
  waiting: TaskDecision[];
  runState: RunState;
  deadlock?: string;
};

const activeStates = new Set<TaskState>(['scheduled', 'queued', 'running', 'deferred', 'up_for_retry']);

function leafTaskIds(dag: DagDefinition) {
  const parents = new Set(dag.tasks.flatMap((task) => task.upstream));
  return dag.tasks.filter((task) => !parents.has(task.id)).map((task) => task.id);
}

export function planRun(dag: DagDefinition, current: Readonly<Record<string, TaskState>>): RunPlan {
  const states = new Map(dag.tasks.map((task) => [task.id, current[task.id] ?? 'pending']));
  const tasksById = new Map(dag.tasks.map((task) => [task.id, task]));
  const plan: RunPlan = { schedule: [], upstreamFailed: [], skip: [], waiting: [], runState: 'running' };

  for (const taskId of topologicalOrder(dag)) {
    if (states.get(taskId) !== 'pending') continue;
    const task = tasksById.get(taskId)!;
    const verdict = evaluateTriggerRule(
      task.triggerRule,
      task.upstream.map((parent) => states.get(parent)!),
    );

    switch (verdict.outcome) {
      case 'ready':
        states.set(taskId, 'scheduled');
        plan.schedule.push(taskId);
        break;
      case 'upstream_failed':
        states.set(taskId, 'upstream_failed');
        plan.upstreamFailed.push({ taskId, reason: verdict.reason });
        break;
      case 'skipped':
        states.set(taskId, 'skipped');
        plan.skip.push({ taskId, reason: verdict.reason });
        break;
      case 'waiting':
        plan.waiting.push({ taskId, reason: verdict.reason });
        break;
    }
  }

  const finalStates = [...states.values()];
  if (finalStates.every(isFinished)) {
    const failedLeaf = leafTaskIds(dag).some((taskId) => isFailure(states.get(taskId)!));
    plan.runState = failedLeaf ? 'failed' : 'success';
  } else if (!finalStates.some((state) => activeStates.has(state))) {
    plan.runState = 'failed';
    plan.deadlock = `tasks ${plan.waiting.map((w) => w.taskId).join(', ')} can never start`;
  }
  return plan;
}
