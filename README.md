# airnest

Orquestração de DAGs no molde do Airflow para quem já está em NestJS e Postgres: data lógica e
intervalo de dados, catchup, backfill, trigger rules e retries, com control plane NestJS e admin
React gerado a partir da definição das DAGs.

> Em construção. Nome provisório.

## Pacotes

| Pacote          | O que é                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `@airnest/core` | definição de DAG, validação do grafo, trigger rules, planejamento de run, retry e agenda por cron com timezone; sem dependência de framework |

## Exemplo

```ts
import { defineDag } from '@airnest/core';

export const salesDaily = defineDag(
  { id: 'sales_daily', schedule: '0 3 * * *', timezone: 'America/Sao_Paulo', catchup: true },
  (dag) => {
    const extract = dag.task('extract', { retries: 3, retryBackoff: 'exponential' }, (ctx) =>
      fetchSales(ctx.dataInterval),
    );
    dag.task('load', { after: [extract] }, (ctx) => saveSales(ctx.output(extract)));
  },
);
```

## Desenvolvimento

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

## Licença

MIT
