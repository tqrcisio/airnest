# @airnest/nestjs

Airflow-style DAGs for NestJS. A DAG is a provider, a task is a method, and the scheduler and workers run inside your
application, coordinated through PostgreSQL.

```bash
pnpm add @airnest/nestjs @airnest/postgres pg
```

```ts
@Dag({ id: 'sales_daily', schedule: '0 3 * * *', timezone: 'America/Sao_Paulo', catchup: true })
export class SalesDailyDag {
  constructor(private readonly gateway: SalesGateway, private readonly warehouse: Warehouse) {}

  @Task({ retries: 3, retryBackoff: 'exponential' })
  extract(@DataInterval() interval: DataInterval) {
    return this.gateway.fetch(interval);
  }

  @Task({ after: ['extract'], pool: 'warehouse' })
  load(@Output('extract') sales: Sale[]) {
    return this.warehouse.upsert(sales);
  }
}

@Module({
  imports: [AirnestModule.forRoot({ db: fromPgPool(pool), pools: { warehouse: 2 } })],
  providers: [SalesGateway, Warehouse, SalesDailyDag],
})
export class AppModule {}
```

## Partitions

When the same DAG has to run for every tenant, store or account, and that list lives in your database, mark one method
with `@Partitions()`. Each partition gets its own runs, timetable and `maxActiveRuns`, and tasks receive the key through
`@Partition()`.

```ts
@Dag({ id: 'catalog_sync', schedule: '0 * * * *', maxActiveRuns: 1 })
export class CatalogSyncDag {
  constructor(private readonly tenants: TenantRepository, private readonly importer: CatalogImporter) {}

  @Partitions()
  partitions() {
    return this.tenants.withSyncEnabled().then((rows) => rows.map((t) => ({ key: t.id, label: t.name })));
  }

  @Task()
  products(@Partition() tenantId: string, @DataInterval() interval: DataInterval) {
    return this.importer.products(tenantId, interval.start);
  }
}
```

The scheduler calls the method once a minute (`partitions: { refreshMs }` in `forRoot`). A new key starts on the next
fire of the schedule, a key that disappears stops being scheduled and keeps its history, and a key that comes back
resumes from its last run. `airnest.refreshPartitions(dagId)` applies a change right away, and manual runs and
backfills name the partition: `airnest.trigger('catalog_sync', { partition: tenantId })`. A backfill without a
partition creates runs for every active one.

## CommonJS projects

The packages are ES modules. A Nest project compiled to CommonJS loads them through `require()` of ES modules, which
Node supports without flags from 20.19 and 22.12 on, so `import { AirnestModule } from '@airnest/nestjs'` works the same
in both kinds of project.

Documentation: https://tqrcisio.github.io/airnest-docs
