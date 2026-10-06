import { PGlite } from '@electric-sql/pglite';
import {
  airflowDefaultMaxActiveRuns,
  hashDag,
  taskDefaults,
  type DagDefinition,
  type TaskSettings,
} from '@airnest/core';
import { migrate, PostgresDagStore } from '../src/index.js';

export function task(id: string, upstream: string[] = [], settings: Partial<TaskSettings> = {}) {
  return { ...taskDefaults, ...settings, id, upstream };
}

export function dag(id: string, ...tasks: DagDefinition['tasks']): DagDefinition {
  return { id, schedule: null, catchup: false, maxActiveRuns: airflowDefaultMaxActiveRuns, tags: [], tasks };
}

export async function storeWith(...dags: DagDefinition[]) {
  const db = new PGlite();
  await migrate(db);
  const store = new PostgresDagStore(db);
  for (const definition of dags) await store.registerDag(definition, hashDag(definition), clock.start);
  return { db, store };
}

export const clock = {
  start: new Date('2026-10-06T06:00:00Z'),
  after(ms: number) {
    return new Date(this.start.getTime() + ms);
  },
};

export const dailyRun = (dagId: string, day = '2026-10-06') => ({
  dagId,
  logicalDate: new Date(`${day}T06:00:00Z`),
  dataInterval: {
    start: new Date(new Date(`${day}T06:00:00Z`).getTime() - 86_400_000),
    end: new Date(`${day}T06:00:00Z`),
  },
  runType: 'scheduled' as const,
});
