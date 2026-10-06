# @airnest/control-plane

HTTP API and admin UI for [airnest](https://github.com/tqrcisio/airnest). One module serves both: the API under `/airnest`
and the admin under `/airnest/ui`, with the DAG list, run grid, graph, attempts, live task logs, trigger, rerun and
backfill.

```ts
AirnestControlPlaneModule.forRoot({
  db: fromPgPool(pool),
  authorize: (request) => isAdmin(request),
  resolveUser: (request) => currentUserEmail(request),
});
```

Documentation: https://tqrcisio.github.io/airnest-docs/guides/control-plane/
