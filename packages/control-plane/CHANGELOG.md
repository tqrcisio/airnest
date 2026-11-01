# @airnest/control-plane

## 0.1.0

### Minor Changes

- [`dd9fb2f`](https://github.com/tqrcisio/airnest/commit/dd9fb2f70a0b169647f1c7cc701a7bf5cae951dd) Thanks [@tqrcisio](https://github.com/tqrcisio)! - First public release: DAGs as NestJS providers, PostgreSQL storage and queue, control plane and admin.

- [#2](https://github.com/tqrcisio/airnest/pull/2) [`a9736a8`](https://github.com/tqrcisio/airnest/commit/a9736a8c4a88e175185d1592fa822210bd2d6d41) Thanks [@tqrcisio](https://github.com/tqrcisio)! - Partitioned DAGs: `@Partitions()` resolves the keys from your own data, each partition keeps its own timetable and `maxActiveRuns`, tasks read the key with `@Partition()`, and manual runs, backfills, the control plane and the admin take a partition. Runs now expose their data interval, params and timestamps, and `Airnest` gains `run`, `outputs`, `partitions` and `refreshPartitions`.

### Patch Changes

- Updated dependencies [[`dd9fb2f`](https://github.com/tqrcisio/airnest/commit/dd9fb2f70a0b169647f1c7cc701a7bf5cae951dd), [`61da59f`](https://github.com/tqrcisio/airnest/commit/61da59f609fd4ef1fb3fc403d32aa3f39527cdb8), [`a9736a8`](https://github.com/tqrcisio/airnest/commit/a9736a8c4a88e175185d1592fa822210bd2d6d41)]:
  - @airnest/core@0.1.0
  - @airnest/manifest@0.1.0
  - @airnest/postgres@0.1.0
