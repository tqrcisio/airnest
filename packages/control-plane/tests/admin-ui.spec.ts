import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { AirnestControlPlaneModule } from '../src/index.js';

async function boot(extras: { path?: string; ui?: boolean } = {}) {
  const moduleRef = await Test.createTestingModule({
    imports: [AirnestControlPlaneModule.forRoot({ db: new PGlite(), authorize: () => false, ...extras })],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return { app, http: request(app.getHttpServer()) };
}

describe('admin served by the control plane', () => {
  let app: INestApplication;
  afterEach(() => app?.close());

  it('serves the admin with its API base and path, without asking authorize', async () => {
    const booted = await boot({ path: 'ops/airnest' });
    app = booted.app;
    const { text, headers } = await booted.http.get('/ops/airnest/ui').expect(200);

    expect(headers['content-type']).toContain('text/html');
    expect(text).toContain('<base href="/ops/airnest/ui/" />');
    expect(text).toContain('window.__AIRNEST__ = {"apiBase":"/ops/airnest","basePath":"/ops/airnest/ui/"}');
  });

  it('falls back to the page for client routes and serves built assets', async () => {
    const booted = await boot();
    app = booted.app;
    await booted.http
      .get('/airnest/ui/dags/sales_daily/runs/123')
      .expect(200)
      .expect('content-type', /text\/html/);

    const assetsDir = fileURLToPath(new URL('../admin/assets', import.meta.url));
    const script = (await readdir(assetsDir)).find((file) => file.endsWith('.js'))!;
    await booted.http
      .get(`/airnest/ui/assets/${script}`)
      .expect(200)
      .expect('content-type', /text\/javascript/);
  });

  it('never serves files outside the admin folder', async () => {
    const booted = await boot();
    app = booted.app;
    const { text } = await booted.http.get('/airnest/ui/..%2F..%2Fpackage.json').expect(200);
    expect(text).toContain('window.__AIRNEST__');
    expect(text).not.toContain('@airnest/control-plane');
  });

  it('can be turned off', async () => {
    const booted = await boot({ ui: false });
    app = booted.app;
    await booted.http.get('/airnest/ui').expect(404);
  });
});
