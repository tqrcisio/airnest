export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type FieldKind =
  'text' | 'code' | 'number' | 'datetime' | 'duration' | 'boolean' | 'state' | 'enum' | 'json' | 'relation';

export type FieldManifest = {
  name: string;
  label: string;
  kind: FieldKind;
  list?: boolean;
  filter?: 'search' | 'enum';
  sort?: boolean;
  options?: { value: string; label: string; tone: Tone }[];
  relation?: EntitySlug;
};

export type EntitySlug = 'dags' | 'runs' | 'task-instances' | 'attempts';

export type ActionManifest = {
  name: 'trigger' | 'pause' | 'unpause';
  label: string;
  scope: 'row' | 'detail';
  input?: 'dag-params';
  confirm?: string;
};

export type EntityManifest = {
  slug: EntitySlug;
  label: { singular: string; plural: string };
  fields: FieldManifest[];
  actions: ActionManifest[];
};

export type DagManifest = {
  id: string;
  version: string;
  schedule: { cron: string; timezone: string } | null;
  catchup: boolean;
  maxActiveRuns: number;
  tags: string[];
  params: Record<string, unknown> | null;
  isPaused: boolean;
  tasks: { id: string; upstream: string[]; triggerRule: string; retries: number; timeoutMs: number | null }[];
};

export type Manifest = {
  version: 1;
  entities: EntityManifest[];
  dags: DagManifest[];
};
