---
'@airnest/core': patch
---

A scheduled DAG or partition without `startDate` now runs at the fire that just came due. Before, its first run was always computed from the current time, so each due fire was pushed to the next one and the schedule never ran.
