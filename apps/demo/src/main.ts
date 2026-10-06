import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PGlite } from '@electric-sql/pglite';
import { AirnestControlPlaneModule } from '@airnest/control-plane';
import { AirnestModule } from '@airnest/nestjs';
import { InvoicesDag, NightlyExportDag, SalesDailyDag } from './dags.js';

const db = new PGlite(process.env.AIRNEST_DEMO_DATA ?? '.data');
const port = Number(process.env.AIRNEST_DEMO_PORT ?? 3100);

@Module({
  imports: [
    AirnestModule.forRoot({ db, worker: { concurrency: 6, pollMs: 200 }, scheduler: { pollMs: 500 } }),
    AirnestControlPlaneModule.forRoot({
      db,
      authorize: () => true,
      resolveUser: (request) =>
        (request as { headers: Record<string, string | undefined> }).headers['x-user'] ?? 'demo',
    }),
  ],
  providers: [SalesDailyDag, InvoicesDag, NightlyExportDag],
})
class DemoModule {}

const app = await NestFactory.create(DemoModule);
app.enableShutdownHooks();
await app.listen(port);
