import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { airflowDefaultMaxActiveRuns, hashDag, taskDefaults, type DagDefinition } from '@airnest/core';
import { migrate, PostgresDagStore } from '@airnest/postgres';
import { AirnestControlPlaneModule, type Manifest } from '../src/index.js';

const now = new Date('2026-10-06T12:00:00Z');

const salesDaily: DagDefinition = {
  id: 'sales_daily',
  schedule: { cron: '0 3 * * *', timezone: 'America/Sao_Paulo' },
  catchup: false,
  maxActiveRuns: airflowDefaultMaxActiveRuns,
  tags: ['sales'],
  params: { type: 'object', properties: { branches: { type: 'array', items: { type: 'number' } } } },
  tasks: [
    { ...taskDefaults, id: 'extract', upstream: [], retries: 1, retryDelayMs: 0 },
    { ...taskDefaults, id: 'load', upstream: ['extract'] },
  ],
};

async function boot(authorize: (request: unknown) => boolean = () => true) {
  const db = new PGlite();
  await migrate(db);
  const store = new PostgresDagStore(db);
  await store.registerDag(salesDaily, hashDag(salesDaily), now);

  const moduleRef = await Test.createTestingModule({
    imports: [
      AirnestControlPlaneModule.forRoot({
        db,
        authorize,
        resolveUser: (req) => (req as { headers: Record<string, string> }).headers['x-user'],
        clock: () => now,
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return { app, store, http: request(app.getHttpServer()) };
}

describe('control plane', () => {
  let app: INestApplication;
  afterEach(() => app?.close());

  it('describes entities and registered DAGs in the manifest', async () => {
    const booted = await boot();
    app = booted.app;
    const { body } = await booted.http.get('/airnest/manifest').expect(200);
    const manifest = body as Manifest;

    expect(manifest.entities.map((entity) => entity.slug)).toEqual(['dags', 'runs', 'task-instances', 'attempts']);
    expect(manifest.dags).toEqual([
      {
        id: 'sales_daily',
        version: hashDag(salesDaily),
        schedule: { cron: '0 3 * * *', timezone: 'America/Sao_Paulo' },
        catchup: false,
        maxActiveRuns: 16,
        tags: ['sales'],
        params: salesDaily.params,
        isPaused: false,
        tasks: [
          { id: 'extract', upstream: [], triggerRule: 'all_success', retries: 1, timeoutMs: null },
          { id: 'load', upstream: ['extract'], triggerRule: 'all_success', retries: 0, timeoutMs: null },
        ],
      },
    ]);
  });

  it('triggers a run with params and records who asked for it', async () => {
    const booted = await boot();
    app = booted.app;
    const { body: run } = await booted.http
      .post('/airnest/dags/sales_daily/runs')
      .set('x-user', 'ana@example.com')
      .send({ params: { branches: [1, 2] } })
      .expect(201);

    expect(run).toMatchObject({
      dagId: 'sales_daily',
      runType: 'manual',
      state: 'queued',
      triggeredBy: 'ana@example.com',
      logicalDate: now.toISOString(),
    });
    expect(run.tasks.map((task: { taskId: string; state: string }) => [task.taskId, task.state])).toEqual([
      ['extract', 'pending'],
      ['load', 'pending'],
    ]);

    await booted.http.get(`/airnest/runs/${run.runId}`).expect(200);
    const { body: runs } = await booted.http.get('/airnest/dags/sales_daily/runs?limit=5').expect(200);
    expect(runs).toHaveLength(1);
  });

  it('rejects a second manual run for the same logical date and bad input', async () => {
    const booted = await boot();
    app = booted.app;
    await booted.http.post('/airnest/dags/sales_daily/runs').send({}).expect(201);
    await booted.http.post('/airnest/dags/sales_daily/runs').send({}).expect(409);
    await booted.http
      .post('/airnest/dags/sales_daily/runs')
      .send({ params: [1] })
      .expect(400);
    await booted.http.post('/airnest/dags/sales_daily/runs').send({ logicalDate: 'yesterday' }).expect(400);
    await booted.http.post('/airnest/dags/missing/runs').send({}).expect(404);
  });

  it('lists attempts of a task after retries', async () => {
    const booted = await boot();
    app = booted.app;
    const { body: run } = await booted.http.post('/airnest/dags/sales_daily/runs').send({}).expect(201);

    await booted.store.advanceRuns(now);
    const [first] = await booted.store.claimTasks('worker-a', now, 60_000);
    await booted.store.fail(first.attemptId, 'gateway timeout', now);
    await booted.store.advanceRuns(now);
    const [second] = await booted.store.claimTasks('worker-b', now, 60_000);
    await booted.store.succeed(second.attemptId, [1], now);

    const { body: attempts } = await booted.http.get(`/airnest/runs/${run.runId}/tasks/extract/attempts`).expect(200);
    expect(
      attempts.map((a: { tryNumber: number; workerId: string; state: string; error: string | null }) => [
        a.tryNumber,
        a.workerId,
        a.state,
        a.error,
      ]),
    ).toEqual([
      [1, 'worker-a', 'up_for_retry', 'gateway timeout'],
      [2, 'worker-b', 'success', null],
    ]);
    await booted.http.get(`/airnest/runs/${run.runId}/tasks/nope/attempts`).expect(404);
    await booted.http.get('/airnest/runs/not-a-uuid').expect(400);
  });

  it('pauses and resumes a DAG', async () => {
    const booted = await boot();
    app = booted.app;
    await booted.http.post('/airnest/dags/sales_daily/pause').set('x-user', 'ana@example.com').expect(204);
    expect((await booted.http.get('/airnest/dags/sales_daily').expect(200)).body).toMatchObject({
      isPaused: true,
      pausedBy: 'ana@example.com',
    });
    expect(await booted.store.createDueRuns(new Date('2026-10-08T12:00:00Z'))).toEqual({ created: [], stalled: [] });

    await booted.http.post('/airnest/dags/sales_daily/unpause').expect(204);
    expect((await booted.http.get('/airnest/dags').expect(200)).body[0]).toMatchObject({
      isPaused: false,
      pausedBy: null,
    });
  });

  it('refuses every route when authorize says no', async () => {
    const booted = await boot(() => false);
    app = booted.app;
    await booted.http.get('/airnest/manifest').expect(403);
    await booted.http.post('/airnest/dags/sales_daily/runs').send({}).expect(403);
  });
});
