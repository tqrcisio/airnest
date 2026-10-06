import {
  canRetry,
  InvalidParamsError,
  isFailure,
  isFinished,
  nextScheduledRun,
  planRun,
  resolveParams,
  retryDelayMs,
  scheduledRunsBetween,
  ScheduleStalledError,
  type DagDefinition,
  type DataInterval,
  type RunState,
  type TaskState,
} from '@airnest/core';
import type { Queryable, SqlClient } from './sql-client.js';

export type RunType = 'scheduled' | 'manual' | 'backfill';

export type NewRun = {
  dagId: string;
  logicalDate: Date;
  dataInterval: DataInterval;
  runType: RunType;
  params?: Record<string, unknown>;
  triggeredBy?: string;
};

export type ClaimedTask = {
  attemptId: string;
  runId: string;
  dagId: string;
  taskId: string;
  tryNumber: number;
  logicalDate: Date;
  dataInterval: DataInterval;
  params: Record<string, unknown>;
  leaseExpiresAt: Date;
};

export class TaskStillActiveError extends Error {
  constructor(readonly taskIds: string[]) {
    super(`Tasks ${taskIds.join(', ')} are still running; wait for them to finish before clearing`);
  }
}

export type ClearOptions = {
  taskIds?: string[];
  downstream?: boolean;
  onlyFailed?: boolean;
  clearedBy?: string;
};

export type BackfillOptions = { params?: Record<string, unknown>; triggeredBy?: string };

export type LogLevel = 'log' | 'warn' | 'error';

export type LogEntry = {
  runId: string;
  taskId: string;
  tryNumber: number;
  level: LogLevel;
  message: string;
  at: Date;
};

export type LogLine = { seq: number; tryNumber: number; level: LogLevel; message: string; at: Date };

export type PoolSummary = { name: string; slots: number; running: number; queued: number; description: string | null };

export type FinishedRun = { runId: string; dagId: string; state: RunState; reason?: string };

export type AdvanceReport = { queued: number; finished: FinishedRun[] };

export type SchedulingReport = { created: { runId: string; dagId: string; logicalDate: Date }[]; stalled: string[] };

export type TaskSummary = {
  taskId: string;
  state: TaskState;
  tryNumber: number;
  reason: string | null;
  lastError: string | null;
};

export type DagSummary = {
  dagId: string;
  version: string;
  definition: DagDefinition;
  isPaused: boolean;
  pausedBy: string | null;
  nextRunAfter: Date | null;
  lastLogicalDate: Date | null;
  lastRunState: RunState | null;
};

export type AttemptSummary = {
  attemptId: string;
  tryNumber: number;
  workerId: string;
  state: 'success' | 'failed' | 'up_for_retry';
  error: string | null;
  startedAt: Date;
  finishedAt: Date;
};

export type RunSummary = {
  runId: string;
  dagId: string;
  runType: RunType;
  state: RunState;
  logicalDate: Date;
  failureReason: string | null;
  triggeredBy: string | null;
  tasks: TaskSummary[];
};

type DagRow = {
  dag_id: string;
  latest_version: string;
  definition: DagDefinition;
  is_paused: boolean;
  paused_by: string | null;
  next_run_after: Date | null;
  last_logical_date: Date | null;
  last_run_state: RunState | null;
};
type RunListRow = {
  run_id: string;
  dag_id: string;
  run_type: RunType;
  state: RunState;
  logical_date: Date;
  failure_reason: string | null;
  triggered_by: string | null;
};
type DueDagRow = { dag_id: string; latest_version: string; last_logical_date: Date | null };
type RunRow = { run_id: string; dag_id: string; dag_version: string; state: RunState };
type TaskRow = { task_id: string; state: TaskState; retry_at: Date | null };
type RunningAttemptRow = {
  run_id: string;
  task_id: string;
  try_number: number;
  worker_id: string;
  started_at: Date;
  dag_id: string;
  dag_version: string;
};

const leafFailureReason = 'a final task failed';

export class PostgresDagStore {
  private readonly definitions = new Map<string, DagDefinition>();

  constructor(private readonly db: SqlClient) {}

  async registerDag(definition: DagDefinition, version: string, now: Date) {
    await this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ last_logical_date: Date | null }>(
        `insert into airnest.dag (dag_id, latest_version, created_at, updated_at) values ($1, $2, $3, $3)
         on conflict (dag_id) do update set latest_version = excluded.latest_version, updated_at = excluded.updated_at
         returning last_logical_date`,
        [definition.id, version, now],
      );
      await tx.query(
        `insert into airnest.dag_version (dag_id, version, definition, created_at) values ($1, $2, $3::jsonb, $4)
         on conflict do nothing`,
        [definition.id, version, JSON.stringify(definition), now],
      );
      const next = nextScheduledRun(definition, rows[0].last_logical_date, now);
      await tx.query('update airnest.dag set next_run_after = $2 where dag_id = $1', [
        definition.id,
        next?.logicalDate ?? null,
      ]);
    });
  }

  async createRun(run: NewRun, now: Date): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      return this.insertRun(tx, run, await this.latestVersion(tx, run.dagId), now);
    });
  }

  async createDueRuns(now: Date, limit = 50, maxRunsPerDag = 10): Promise<SchedulingReport> {
    return this.db.transaction(async (tx) => {
      const { rows: due } = await tx.query<DueDagRow>(
        `select dag_id, latest_version, last_logical_date from airnest.dag
         where not is_paused and next_run_after <= $1
         order by next_run_after limit $2 for update skip locked`,
        [now, limit],
      );
      const report: SchedulingReport = { created: [], stalled: [] };
      for (const dag of due) {
        try {
          await this.createDueRunsOf(tx, dag, now, maxRunsPerDag, report);
        } catch (error) {
          if (!(error instanceof ScheduleStalledError || error instanceof InvalidParamsError)) throw error;
          await tx.query('update airnest.dag set next_run_after = null where dag_id = $1', [dag.dag_id]);
          report.stalled.push(dag.dag_id);
        }
      }
      return report;
    });
  }

  private async createDueRunsOf(tx: Queryable, dag: DueDagRow, now: Date, maxRuns: number, report: SchedulingReport) {
    const definition = await this.definition(tx, dag.dag_id, dag.latest_version);
    const { rows: active } = await tx.query<{ count: number }>(
      `select count(*)::int as count from airnest.dag_run where dag_id = $1 and state in ('queued', 'running')`,
      [dag.dag_id],
    );
    let slots = Math.min(maxRuns, definition.maxActiveRuns - active[0].count);
    let last = dag.last_logical_date;
    let next = nextScheduledRun(definition, last, now);

    while (slots > 0 && next && next.logicalDate <= now) {
      const runId = await this.insertRun(
        tx,
        { dagId: dag.dag_id, logicalDate: next.logicalDate, dataInterval: next.dataInterval, runType: 'scheduled' },
        dag.latest_version,
        now,
      );
      if (runId) report.created.push({ runId, dagId: dag.dag_id, logicalDate: next.logicalDate });
      last = next.logicalDate;
      next = nextScheduledRun(definition, last, now);
      slots--;
    }

    await tx.query(
      'update airnest.dag set last_logical_date = $2, next_run_after = $3, updated_at = $4 where dag_id = $1',
      [dag.dag_id, last, next?.logicalDate ?? null, now],
    );
  }

  private async insertRun(tx: Queryable, run: NewRun, version: string, now: Date) {
    const definition = await this.definition(tx, run.dagId, version);
    const params = resolveParams(definition.params, run.params);
    const { rows: created } = await tx.query<{ run_id: string }>(
      `insert into airnest.dag_run (dag_id, dag_version, logical_date, data_interval_start, data_interval_end,
         run_type, state, params, triggered_by, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, 'queued', $7::jsonb, $8, $9, $9)
       on conflict (dag_id, logical_date) do nothing
       returning run_id`,
      [
        run.dagId,
        version,
        run.logicalDate,
        run.dataInterval.start,
        run.dataInterval.end,
        run.runType,
        JSON.stringify(params),
        run.triggeredBy ?? null,
        now,
      ],
    );
    if (created.length === 0) return null;
    const runId = created[0].run_id;

    await tx.query(
      `insert into airnest.task_instance (run_id, task_id, pool, state, created_at, updated_at)
       select $1, task.id, task.pool, 'pending', $4, $4 from unnest($2::text[], $3::text[]) as task(id, pool)`,
      [runId, definition.tasks.map((task) => task.id), definition.tasks.map((task) => task.pool ?? null), now],
    );
    return runId;
  }

  async createBackfill(dagId: string, from: Date, to: Date, options: BackfillOptions, now: Date) {
    return this.db.transaction(async (tx) => {
      const version = await this.latestVersion(tx, dagId);
      const definition = await this.definition(tx, dagId, version);
      const created: string[] = [];
      let skipped = 0;
      for (const { logicalDate, dataInterval } of scheduledRunsBetween(definition, from, to)) {
        const runId = await this.insertRun(
          tx,
          {
            dagId,
            logicalDate,
            dataInterval,
            runType: 'backfill',
            params: options.params,
            triggeredBy: options.triggeredBy,
          },
          version,
          now,
        );
        if (runId) created.push(runId);
        else skipped++;
      }
      return { created, skipped };
    });
  }

  async clearRun(runId: string, options: ClearOptions, now: Date): Promise<string[] | null> {
    return this.db.transaction(async (tx) => {
      const { rows: runs } = await tx.query<RunRow>(
        'select run_id, dag_id, dag_version, state from airnest.dag_run where run_id = $1 for update',
        [runId],
      );
      if (runs.length === 0) return null;
      const definition = await this.definition(tx, runs[0].dag_id, runs[0].dag_version);
      const { rows: tasks } = await tx.query<{ task_id: string; state: TaskState }>(
        'select task_id, state from airnest.task_instance where run_id = $1 for update',
        [runId],
      );
      const stateOf = new Map(tasks.map((task) => [task.task_id, task.state]));

      const unknown = (options.taskIds ?? []).filter((taskId) => !stateOf.has(taskId));
      if (unknown.length > 0) throw new Error(`Run ${runId} has no task ${unknown.join(', ')}`);

      let selected = options.taskIds ?? definition.tasks.map((task) => task.id);
      if (options.onlyFailed) selected = selected.filter((taskId) => isFailure(stateOf.get(taskId)!));
      if (options.downstream ?? true) selected = withDownstream(definition, selected);

      const active = selected.filter((taskId) => {
        const state = stateOf.get(taskId)!;
        return !isFinished(state) && state !== 'pending';
      });
      if (active.length > 0) throw new TaskStillActiveError(active);

      const cleared = selected.filter((taskId) => isFinished(stateOf.get(taskId)!));
      if (cleared.length === 0) return [];

      await tx.query(
        `update airnest.task_instance
         set state = 'pending', reason = null, last_error = null, retry_at = null, lease_expires_at = null,
             finished_at = null, updated_at = $3
         where run_id = $1 and task_id = any($2::text[])`,
        [runId, cleared, now],
      );
      await tx.query(
        `update airnest.dag_run
         set state = case when state in ('success', 'failed') then 'queued' else state end,
             failure_reason = null, finished_at = null, cleared_by = $2, cleared_at = $3, updated_at = $3
         where run_id = $1`,
        [runId, options.clearedBy ?? null, now],
      );
      return cleared;
    });
  }

  async advanceRuns(now: Date, limit = 50): Promise<AdvanceReport> {
    return this.db.transaction(async (tx) => {
      const { rows: runs } = await tx.query<RunRow>(
        `select run_id, dag_id, dag_version, state from airnest.dag_run
         where state in ('queued', 'running') order by logical_date limit $1 for update skip locked`,
        [limit],
      );
      const report: AdvanceReport = { queued: 0, finished: [] };
      for (const run of runs) {
        const finished = await this.advanceRun(tx, run, now, report);
        if (finished) report.finished.push(finished);
      }
      return report;
    });
  }

  private async advanceRun(tx: Queryable, run: RunRow, now: Date, report: AdvanceReport) {
    const definition = await this.definition(tx, run.dag_id, run.dag_version);
    if (run.state === 'queued' && !(await this.hasRunningSlot(tx, run.dag_id, definition.maxActiveRuns))) return null;
    const { rows: tasks } = await tx.query<TaskRow>(
      'select task_id, state, retry_at from airnest.task_instance where run_id = $1',
      [run.run_id],
    );
    const states: Record<string, TaskState> = Object.fromEntries(tasks.map((task) => [task.task_id, task.state]));

    const dueRetries = tasks.filter((task) => task.state === 'up_for_retry' && task.retry_at! <= now);
    for (const task of dueRetries) states[task.task_id] = 'queued';
    await this.moveTasks(
      tx,
      run.run_id,
      dueRetries.map((task) => task.task_id),
      'up_for_retry',
      'queued',
      now,
    );

    const plan = planRun(definition, states);
    await this.moveTasks(tx, run.run_id, plan.schedule, 'pending', 'queued', now);
    report.queued += plan.schedule.length + dueRetries.length;

    for (const { taskId, reason } of [...plan.upstreamFailed, ...plan.skip]) {
      const state = plan.skip.some((skipped) => skipped.taskId === taskId) ? 'skipped' : 'upstream_failed';
      await tx.query(
        `update airnest.task_instance set state = $3, reason = $4, finished_at = $5, updated_at = $5
         where run_id = $1 and task_id = $2 and state = 'pending'`,
        [run.run_id, taskId, state, reason, now],
      );
    }

    if (plan.runState === 'running') {
      if (run.state === 'queued') {
        await tx.query(
          `update airnest.dag_run set state = 'running', started_at = $2, updated_at = $2 where run_id = $1`,
          [run.run_id, now],
        );
      }
      return null;
    }

    const reason = plan.runState === 'failed' ? (plan.deadlock ?? leafFailureReason) : undefined;
    await tx.query(
      `update airnest.dag_run set state = $2, failure_reason = $3, started_at = coalesce(started_at, $4),
         finished_at = $4, updated_at = $4
       where run_id = $1`,
      [run.run_id, plan.runState, reason ?? null, now],
    );
    return { runId: run.run_id, dagId: run.dag_id, state: plan.runState, reason };
  }

  private async hasRunningSlot(tx: Queryable, dagId: string, maxActiveRuns: number) {
    await tx.query(`select pg_advisory_xact_lock(hashtext('airnest:runs:' || $1))`, [dagId]);
    const { rows } = await tx.query<{ count: number }>(
      `select count(*)::int as count from airnest.dag_run where dag_id = $1 and state = 'running'`,
      [dagId],
    );
    return rows[0].count < maxActiveRuns;
  }

  private async moveTasks(tx: Queryable, runId: string, taskIds: string[], from: TaskState, to: TaskState, now: Date) {
    if (taskIds.length === 0) return;
    await tx.query(
      `update airnest.task_instance set state = $4, updated_at = $5
       where run_id = $1 and task_id = any($2::text[]) and state = $3`,
      [runId, taskIds, from, to, now],
    );
  }

  async claimTasks(workerId: string, now: Date, leaseMs: number, limit = 1): Promise<ClaimedTask[]> {
    return this.db.transaction(async (tx) => {
      const { rows: free } = await tx.query<{ run_id: string; task_id: string }>(
        `select run_id, task_id from airnest.task_instance
         where state = 'queued' and pool is null order by updated_at limit $1 for update skip locked`,
        [limit],
      );
      const pooled = free.length < limit ? await this.claimablePooledTasks(tx, limit - free.length) : [];
      const picked = [...free, ...pooled];
      if (picked.length === 0) return [];

      const { rows: claimed } = await tx.query<{
        attempt_id: string;
        run_id: string;
        task_id: string;
        try_number: number;
        lease_expires_at: Date;
      }>(
        `update airnest.task_instance ti
         set state = 'running', try_number = ti.try_number + 1, attempt_id = gen_random_uuid(), worker_id = $3,
             lease_expires_at = $4, started_at = $5, finished_at = null, updated_at = $5
         from unnest($1::uuid[], $2::text[]) as picked(run_id, task_id)
         where ti.run_id = picked.run_id and ti.task_id = picked.task_id and ti.state = 'queued'
         returning ti.attempt_id, ti.run_id, ti.task_id, ti.try_number, ti.lease_expires_at`,
        [
          picked.map((task) => task.run_id),
          picked.map((task) => task.task_id),
          workerId,
          new Date(now.getTime() + leaseMs),
          now,
        ],
      );
      if (claimed.length === 0) return [];

      const { rows: runs } = await tx.query<{
        run_id: string;
        dag_id: string;
        logical_date: Date;
        data_interval_start: Date;
        data_interval_end: Date;
        params: Record<string, unknown>;
      }>(
        `select run_id, dag_id, logical_date, data_interval_start, data_interval_end, params
         from airnest.dag_run where run_id = any($1::uuid[])`,
        [[...new Set(claimed.map((task) => task.run_id))]],
      );
      const runsById = new Map(runs.map((run) => [run.run_id, run]));

      return claimed.map((task) => {
        const run = runsById.get(task.run_id)!;
        return {
          attemptId: task.attempt_id,
          runId: task.run_id,
          dagId: run.dag_id,
          taskId: task.task_id,
          tryNumber: task.try_number,
          logicalDate: run.logical_date,
          dataInterval: { start: run.data_interval_start, end: run.data_interval_end },
          params: run.params,
          leaseExpiresAt: task.lease_expires_at,
        };
      });
    });
  }

  private async claimablePooledTasks(tx: Queryable, limit: number) {
    const { rows: lock } = await tx.query<{ locked: boolean }>(
      `select pg_try_advisory_xact_lock(hashtext('airnest:pools')) as locked`,
    );
    if (!lock[0].locked) return [];

    const { rows: candidates } = await tx.query<{ run_id: string; task_id: string }>(
      `with open_slots as (
         select p.name, p.slots - count(r.task_id) as free
         from airnest.pool p
         left join airnest.task_instance r on r.pool = p.name and r.state = 'running'
         group by p.name, p.slots
       ),
       ranked as (
         select run_id, task_id, pool, row_number() over (partition by pool order by updated_at) as position
         from airnest.task_instance where state = 'queued' and pool is not null
       )
       select ranked.run_id, ranked.task_id from ranked
       join open_slots on open_slots.name = ranked.pool
       where ranked.position <= open_slots.free
       limit $1`,
      [limit],
    );
    if (candidates.length === 0) return [];
    const { rows } = await tx.query<{ run_id: string; task_id: string }>(
      `select ti.run_id, ti.task_id from airnest.task_instance ti
       join unnest($1::uuid[], $2::text[]) as candidate(run_id, task_id)
         on ti.run_id = candidate.run_id and ti.task_id = candidate.task_id
       where ti.state = 'queued'
       for update of ti skip locked`,
      [candidates.map((task) => task.run_id), candidates.map((task) => task.task_id)],
    );
    return rows;
  }

  async upsertPools(pools: Record<string, number | { slots: number; description?: string }>, now: Date) {
    for (const [name, pool] of Object.entries(pools)) {
      const { slots, description } = typeof pool === 'number' ? { slots: pool, description: undefined } : pool;
      await this.db.query(
        `insert into airnest.pool (name, slots, description, created_at, updated_at) values ($1, $2, $3, $4, $4)
         on conflict (name) do update set slots = excluded.slots, description = excluded.description,
           updated_at = excluded.updated_at`,
        [name, slots, description ?? null, now],
      );
    }
  }

  async pools(): Promise<PoolSummary[]> {
    const { rows } = await this.db.query<PoolSummary>(
      `select p.name, p.slots, p.description,
         count(ti.task_id) filter (where ti.state = 'running')::int as running,
         count(ti.task_id) filter (where ti.state = 'queued')::int as queued
       from airnest.pool p left join airnest.task_instance ti on ti.pool = p.name
       group by p.name, p.slots, p.description order by p.name`,
    );
    return rows;
  }

  async appendLogs(entries: LogEntry[]) {
    if (entries.length === 0) return;
    await this.db.query(
      `insert into airnest.task_log (run_id, task_id, try_number, level, message, created_at)
       select * from unnest($1::uuid[], $2::text[], $3::int[], $4::text[], $5::text[], $6::timestamptz[])`,
      [
        entries.map((entry) => entry.runId),
        entries.map((entry) => entry.taskId),
        entries.map((entry) => entry.tryNumber),
        entries.map((entry) => entry.level),
        entries.map((entry) => entry.message),
        entries.map((entry) => entry.at),
      ],
    );
  }

  async logs(runId: string, taskId: string, afterSeq = 0, limit = 1000): Promise<LogLine[]> {
    const { rows } = await this.db.query<{
      seq: string;
      try_number: number;
      level: LogLevel;
      message: string;
      created_at: Date;
    }>(
      `select seq, try_number, level, message, created_at from airnest.task_log
       where run_id = $1 and task_id = $2 and seq > $3 order by seq limit $4`,
      [runId, taskId, afterSeq, limit],
    );
    return rows.map((row) => ({
      seq: Number(row.seq),
      tryNumber: row.try_number,
      level: row.level,
      message: row.message,
      at: row.created_at,
    }));
  }

  async purgeRunsBefore(cutoff: Date, limit = 500) {
    const { rows } = await this.db.query(
      `delete from airnest.dag_run where run_id in (
         select run_id from airnest.dag_run
         where state in ('success', 'failed') and coalesce(finished_at, logical_date) < $1
         order by logical_date limit $2
       ) returning 1`,
      [cutoff, limit],
    );
    return rows.length;
  }

  async heartbeat(attemptId: string, now: Date, leaseMs: number) {
    const { rows } = await this.db.query(
      `update airnest.task_instance set lease_expires_at = $3, updated_at = $2
       where attempt_id = $1 and state = 'running' returning 1`,
      [attemptId, now, new Date(now.getTime() + leaseMs)],
    );
    return rows.length > 0;
  }

  async succeed(attemptId: string, output: unknown, now: Date) {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<RunningAttemptRow>(
        `update airnest.task_instance set state = 'success', lease_expires_at = null, finished_at = $2, updated_at = $2
         where attempt_id = $1 and state = 'running'
         returning run_id, task_id, try_number, worker_id, started_at`,
        [attemptId, now],
      );
      if (rows.length === 0) return false;
      const attempt = rows[0];

      if (output !== undefined) {
        await tx.query(
          `insert into airnest.xcom (run_id, task_id, key, value, created_at) values ($1, $2, 'return_value', $3::jsonb, $4)
           on conflict (run_id, task_id, key) do update set value = excluded.value, created_at = excluded.created_at`,
          [attempt.run_id, attempt.task_id, JSON.stringify(output), now],
        );
      }
      await this.recordAttempt(tx, attemptId, attempt, 'success', null, now);
      return true;
    });
  }

  async fail(attemptId: string, error: string, now: Date) {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<RunningAttemptRow>(
        `select ti.run_id, ti.task_id, ti.try_number, ti.worker_id, ti.started_at, r.dag_id, r.dag_version
         from airnest.task_instance ti join airnest.dag_run r using (run_id)
         where ti.attempt_id = $1 and ti.state = 'running'
         for update of ti`,
        [attemptId],
      );
      if (rows.length === 0) return false;
      const attempt = rows[0];

      const definition = await this.definition(tx, attempt.dag_id, attempt.dag_version);
      const task = definition.tasks.find((candidate) => candidate.id === attempt.task_id)!;
      const retrying = canRetry(task, attempt.try_number);
      const retryAt = retrying
        ? new Date(
            now.getTime() +
              retryDelayMs(task, attempt.try_number, `${attempt.run_id}:${attempt.task_id}:${attempt.try_number}`),
          )
        : null;

      await tx.query(
        `update airnest.task_instance
         set state = $2, retry_at = $3, last_error = $4, lease_expires_at = null,
             finished_at = case when $2 = 'failed' then $5::timestamptz end, updated_at = $5
         where attempt_id = $1`,
        [attemptId, retrying ? 'up_for_retry' : 'failed', retryAt, error, now],
      );
      await this.recordAttempt(tx, attemptId, attempt, retrying ? 'up_for_retry' : 'failed', error, now);
      return true;
    });
  }

  async reapExpiredLeases(now: Date, limit = 100) {
    const { rows } = await this.db.query<{ attempt_id: string }>(
      `select attempt_id from airnest.task_instance
       where state = 'running' and lease_expires_at < $1 order by lease_expires_at limit $2`,
      [now, limit],
    );
    let reaped = 0;
    for (const { attempt_id } of rows) {
      if (await this.fail(attempt_id, 'worker stopped renewing its lease', now)) reaped++;
    }
    return reaped;
  }

  async outputs(runId: string, taskIds: string[]): Promise<Record<string, unknown>> {
    const { rows } = await this.db.query<{ task_id: string; value: unknown }>(
      `select task_id, value from airnest.xcom
       where run_id = $1 and key = 'return_value' and task_id = any($2::text[])`,
      [runId, taskIds],
    );
    return Object.fromEntries(rows.map((row) => [row.task_id, row.value]));
  }

  async dags(dagId?: string): Promise<DagSummary[]> {
    const { rows } = await this.db.query<DagRow>(
      `select d.dag_id, d.latest_version, v.definition, d.is_paused, d.paused_by, d.next_run_after, d.last_logical_date,
         (select r.state from airnest.dag_run r where r.dag_id = d.dag_id order by r.logical_date desc limit 1)
           as last_run_state
       from airnest.dag d join airnest.dag_version v on v.dag_id = d.dag_id and v.version = d.latest_version
       where $1::text is null or d.dag_id = $1
       order by d.dag_id`,
      [dagId ?? null],
    );
    return rows.map((row) => ({
      dagId: row.dag_id,
      version: row.latest_version,
      definition: row.definition,
      isPaused: row.is_paused,
      pausedBy: row.paused_by,
      nextRunAfter: row.next_run_after,
      lastLogicalDate: row.last_logical_date,
      lastRunState: row.last_run_state,
    }));
  }

  async setPaused(dagId: string, paused: boolean, by: string | null, now: Date) {
    const { rows } = await this.db.query(
      `update airnest.dag set is_paused = $2, paused_by = case when $2 then $3 end, updated_at = $4
       where dag_id = $1 returning 1`,
      [dagId, paused, by, now],
    );
    return rows.length > 0;
  }

  async runs(dagId: string, limit = 25): Promise<RunSummary[]> {
    const { rows } = await this.db.query<RunListRow>(
      `select run_id, dag_id, run_type, state, logical_date, failure_reason, triggered_by from airnest.dag_run
       where dag_id = $1 order by logical_date desc limit $2`,
      [dagId, limit],
    );
    return this.withTasks(rows);
  }

  async run(runId: string): Promise<RunSummary | null> {
    const { rows } = await this.db.query<RunListRow>(
      `select run_id, dag_id, run_type, state, logical_date, failure_reason, triggered_by from airnest.dag_run
       where run_id = $1`,
      [runId],
    );
    const [run] = await this.withTasks(rows);
    return run ?? null;
  }

  async attempts(runId: string, taskId: string): Promise<AttemptSummary[]> {
    const { rows } = await this.db.query<{
      attempt_id: string;
      try_number: number;
      worker_id: string;
      state: AttemptSummary['state'];
      error: string | null;
      started_at: Date;
      finished_at: Date;
    }>(
      `select attempt_id, try_number, worker_id, state, error, started_at, finished_at from airnest.task_attempt
       where run_id = $1 and task_id = $2 order by try_number`,
      [runId, taskId],
    );
    return rows.map((row) => ({
      attemptId: row.attempt_id,
      tryNumber: row.try_number,
      workerId: row.worker_id,
      state: row.state,
      error: row.error,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    }));
  }

  private async withTasks(runs: RunListRow[]): Promise<RunSummary[]> {
    if (runs.length === 0) return [];
    const { rows: tasks } = await this.db.query<{
      run_id: string;
      task_id: string;
      state: TaskState;
      try_number: number;
      reason: string | null;
      last_error: string | null;
    }>(
      `select run_id, task_id, state, try_number, reason, last_error from airnest.task_instance
       where run_id = any($1::uuid[]) order by created_at, task_id`,
      [runs.map((run) => run.run_id)],
    );

    return runs.map((run) => ({
      runId: run.run_id,
      dagId: run.dag_id,
      runType: run.run_type,
      state: run.state,
      logicalDate: run.logical_date,
      failureReason: run.failure_reason,
      triggeredBy: run.triggered_by,
      tasks: tasks
        .filter((task) => task.run_id === run.run_id)
        .map((task) => ({
          taskId: task.task_id,
          state: task.state,
          tryNumber: task.try_number,
          reason: task.reason,
          lastError: task.last_error,
        })),
    }));
  }

  private async recordAttempt(
    tx: Queryable,
    attemptId: string,
    attempt: Pick<RunningAttemptRow, 'run_id' | 'task_id' | 'try_number' | 'worker_id' | 'started_at'>,
    state: 'success' | 'failed' | 'up_for_retry',
    error: string | null,
    now: Date,
  ) {
    await tx.query(
      `insert into airnest.task_attempt
         (attempt_id, run_id, task_id, try_number, worker_id, state, error, started_at, finished_at, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        attemptId,
        attempt.run_id,
        attempt.task_id,
        attempt.try_number,
        attempt.worker_id,
        state,
        error,
        attempt.started_at,
        now,
      ],
    );
  }

  private async latestVersion(q: Queryable, dagId: string) {
    const { rows } = await q.query<{ latest_version: string }>(
      'select latest_version from airnest.dag where dag_id = $1',
      [dagId],
    );
    if (rows.length === 0) throw new Error(`DAG ${dagId} is not registered`);
    return rows[0].latest_version;
  }

  private async definition(q: Queryable, dagId: string, version: string) {
    const key = `${dagId}@${version}`;
    const cached = this.definitions.get(key);
    if (cached) return cached;

    const { rows } = await q.query<{ definition: DagDefinition }>(
      'select definition from airnest.dag_version where dag_id = $1 and version = $2',
      [dagId, version],
    );
    if (rows.length === 0) throw new Error(`DAG ${dagId} has no version ${version}`);
    this.definitions.set(key, rows[0].definition);
    return rows[0].definition;
  }
}

function withDownstream(definition: DagDefinition, taskIds: string[]) {
  const children = new Map<string, string[]>();
  for (const task of definition.tasks) {
    for (const parent of task.upstream) children.set(parent, [...(children.get(parent) ?? []), task.id]);
  }
  const reached = new Set(taskIds);
  const frontier = [...taskIds];
  while (frontier.length > 0) {
    for (const child of children.get(frontier.pop()!) ?? []) {
      if (!reached.has(child)) {
        reached.add(child);
        frontier.push(child);
      }
    }
  }
  return definition.tasks.map((task) => task.id).filter((taskId) => reached.has(taskId));
}
