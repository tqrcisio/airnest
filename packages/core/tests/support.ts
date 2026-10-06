import { airflowDefaultMaxActiveRuns, taskDefaults, type DagDefinition, type TaskSettings } from '../src/index.js';

export function task(id: string, upstream: string[] = [], settings: Partial<TaskSettings> = {}) {
  return { ...taskDefaults, ...settings, id, upstream };
}

export function dag(id: string, ...tasks: DagDefinition['tasks']): DagDefinition {
  return { id, schedule: null, catchup: false, maxActiveRuns: airflowDefaultMaxActiveRuns, tags: [], tasks };
}
