import type { SqlClient } from './sql-client.js';

const runStates = `'queued', 'running', 'success', 'failed'`;
const taskStates = `'pending', 'scheduled', 'queued', 'running', 'deferred', 'up_for_retry', 'success', 'failed', 'upstream_failed', 'skipped', 'removed'`;

const migrations: string[][] = [
  [
    `create table airnest.dag (
      dag_id text primary key,
      latest_version text not null,
      is_paused boolean not null default false,
      paused_by text,
      next_run_after timestamptz,
      last_logical_date timestamptz,
      created_at timestamptz not null,
      updated_at timestamptz not null
    )`,
    `create table airnest.dag_version (
      dag_id text not null references airnest.dag (dag_id),
      version text not null,
      definition jsonb not null,
      created_at timestamptz not null,
      primary key (dag_id, version)
    )`,
    `create table airnest.dag_run (
      run_id uuid primary key default gen_random_uuid(),
      dag_id text not null references airnest.dag (dag_id),
      dag_version text not null,
      logical_date timestamptz not null,
      data_interval_start timestamptz not null,
      data_interval_end timestamptz not null,
      run_type text not null check (run_type in ('scheduled', 'manual', 'backfill')),
      state text not null check (state in (${runStates})),
      params jsonb not null default '{}',
      failure_reason text,
      triggered_by text,
      started_at timestamptz,
      finished_at timestamptz,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      unique (dag_id, logical_date),
      foreign key (dag_id, dag_version) references airnest.dag_version (dag_id, version)
    )`,
    `create index dag_run_active on airnest.dag_run (logical_date) where state in ('queued', 'running')`,
    `create table airnest.task_instance (
      run_id uuid not null references airnest.dag_run (run_id) on delete cascade,
      task_id text not null,
      state text not null check (state in (${taskStates})),
      try_number integer not null default 0,
      attempt_id uuid unique,
      worker_id text,
      retry_at timestamptz,
      lease_expires_at timestamptz,
      reason text,
      last_error text,
      started_at timestamptz,
      finished_at timestamptz,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      primary key (run_id, task_id)
    )`,
    `create index task_instance_queue on airnest.task_instance (updated_at) where state = 'queued'`,
    `create index task_instance_lease on airnest.task_instance (lease_expires_at) where state = 'running'`,
    `create index task_instance_retry on airnest.task_instance (retry_at) where state = 'up_for_retry'`,
    `create table airnest.task_attempt (
      attempt_id uuid primary key,
      run_id uuid not null references airnest.dag_run (run_id) on delete cascade,
      task_id text not null,
      try_number integer not null,
      worker_id text not null,
      state text not null check (state in ('success', 'failed', 'up_for_retry')),
      error text,
      started_at timestamptz not null,
      finished_at timestamptz not null,
      created_at timestamptz not null
    )`,
    `create index task_attempt_by_task on airnest.task_attempt (run_id, task_id, try_number)`,
    `create table airnest.xcom (
      run_id uuid not null references airnest.dag_run (run_id) on delete cascade,
      task_id text not null,
      key text not null,
      value jsonb not null,
      created_at timestamptz not null,
      primary key (run_id, task_id, key)
    )`,
  ],
  [
    `create table airnest.pool (
      name text primary key,
      slots integer not null check (slots >= 0),
      description text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `alter table airnest.task_instance add column pool text`,
    `alter table airnest.task_instance add column tries_before_clear integer not null default 0`,
    `create index task_instance_pool_running on airnest.task_instance (pool) where state = 'running' and pool is not null`,
    `create table airnest.task_log (
      seq bigserial primary key,
      run_id uuid not null references airnest.dag_run (run_id) on delete cascade,
      task_id text not null,
      try_number integer not null,
      level text not null check (level in ('log', 'warn', 'error')),
      message text not null,
      created_at timestamptz not null
    )`,
    `create index task_log_by_task on airnest.task_log (run_id, task_id, seq)`,
    `alter table airnest.dag_run add column cleared_by text`,
    `alter table airnest.dag_run add column cleared_at timestamptz`,
  ],
];

export async function migrate(db: SqlClient) {
  await db.transaction(async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtext('airnest:migrate'))`);
    await tx.query('create schema if not exists airnest');
    await tx.query(
      'create table if not exists airnest.migration (version integer primary key, applied_at timestamptz not null default now())',
    );
    const { rows } = await tx.query<{ version: number }>(
      'select coalesce(max(version), 0) as version from airnest.migration',
    );
    const applied = rows[0].version;

    for (const [index, statements] of migrations.entries()) {
      const version = index + 1;
      if (version <= applied) continue;
      for (const statement of statements) await tx.query(statement);
      await tx.query('insert into airnest.migration (version) values ($1)', [version]);
    }
  });
}
