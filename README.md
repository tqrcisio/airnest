# airnest

Orquestração de DAGs no molde do Airflow para quem já está em NestJS e Postgres: data lógica e
intervalo de dados, catchup, backfill, trigger rules e retries, com control plane NestJS e admin
React gerado a partir da definição das DAGs.

> Em construção. Nome provisório.

## Pacotes

| Pacote            | O que é                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@airnest/nestjs` | DAGs declaradas como providers do Nest, com `@Dag` e `@Task`                                                      |
| `@airnest/core`   | motor sem framework: validação do grafo, trigger rules, planejamento de run, retry e agenda por cron com timezone |

## Exemplo

```ts
@Dag({ id: 'sales_daily', schedule: '0 3 * * *', timezone: 'America/Sao_Paulo', catchup: true })
export class SalesDailyDag {
  constructor(
    private readonly gateway: SalesGateway,
    private readonly warehouse: Warehouse,
  ) {}

  @Task({ retries: 3, retryBackoff: 'exponential' })
  extract(@DataInterval() interval: DataInterval) {
    return this.gateway.fetch(interval);
  }

  @Task({ after: ['extract'] })
  load(@Output('extract') sales: Sale[]) {
    return this.warehouse.upsert(sales);
  }

  @Task({ after: ['load'], triggerRule: 'one_failed' })
  alert(@Ctx() ctx: DagContext<SalesDailyDag>) {
    return this.warehouse.alert(ctx.dagId, ctx.logicalDate);
  }
}

@Module({ imports: [AirnestModule], providers: [SalesGateway, Warehouse, SalesDailyDag] })
export class SalesModule {}
```

A classe é descoberta em qualquer módulo. Um nome errado em `after` não compila, e `ctx.output('extract')`
devolve o tipo de retorno de `extract`. Ler a saída de uma task fora do `after` derruba o boot com o motivo.

## Desenvolvimento

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

Os testes do `@airnest/postgres` rodam em PGlite. Os de concorrência precisam de um PostgreSQL de verdade e só
rodam com `SQL_TEST_PG_URL` apontando para ele (cada execução cria e apaga o próprio banco).

## Licença

MIT
