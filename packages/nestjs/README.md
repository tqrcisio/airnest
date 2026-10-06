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

Documentation: https://tqrcisio.github.io/airnest-docs
