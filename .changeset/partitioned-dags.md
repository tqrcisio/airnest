---
'@airnest/core': minor
'@airnest/postgres': minor
'@airnest/nestjs': minor
'@airnest/control-plane': minor
'@airnest/manifest': minor
---

Partitioned DAGs: `@Partitions()` resolves the keys from your own data, each partition keeps its own timetable and `maxActiveRuns`, tasks read the key with `@Partition()`, and manual runs, backfills, the control plane and the admin take a partition. Runs now expose their data interval, params and timestamps, and `Airnest` gains `run`, `outputs`, `partitions` and `refreshPartitions`.
