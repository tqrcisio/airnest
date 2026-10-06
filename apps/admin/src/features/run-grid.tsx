import { Link } from '@tanstack/react-router';
import { formatShortDateTime } from '@/lib/format';
import type { DagManifest, FieldManifest, Run } from '@/lib/types';
import { optionOf, toneSwatch } from '@/manifest/tone';

type RunGridProps = {
  dag: DagManifest;
  runs: Run[];
  runState: FieldManifest | undefined;
  taskState: FieldManifest | undefined;
};

export function RunGrid({ dag, runs, runState, taskState }: RunGridProps) {
  if (runs.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No runs yet.</p>;
  }
  const oldestFirst = [...runs].reverse();

  return (
    <div className="relative overflow-x-auto">
      <table className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="sr-only">Task</th>
            {oldestFirst.map((run) => {
              const option = optionOf(runState, run.state);
              return (
                <th key={run.runId} className="p-0 align-bottom">
                  <Link
                    to="/dags/$dagId/runs/$runId"
                    params={{ dagId: dag.id, runId: run.runId }}
                    title={`${formatShortDateTime(run.logicalDate)} · ${option?.label ?? run.state}`}
                    className={`block h-8 w-4 rounded-sm ${toneSwatch[option?.tone ?? 'neutral']} opacity-80 hover:opacity-100`}
                  >
                    <span className="sr-only">{formatShortDateTime(run.logicalDate)}</span>
                  </Link>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {dag.tasks.map((task) => (
            <tr key={task.id}>
              <th
                scope="row"
                className="pr-4 text-left font-mono text-sm font-normal whitespace-nowrap text-foreground/90"
              >
                {task.id}
              </th>
              {oldestFirst.map((run) => {
                const instance = run.tasks.find((candidate) => candidate.taskId === task.id);
                const option = optionOf(taskState, instance?.state ?? 'pending');
                return (
                  <td key={run.runId} className="p-0">
                    <Link
                      to="/dags/$dagId/runs/$runId"
                      params={{ dagId: dag.id, runId: run.runId }}
                      search={{ task: task.id }}
                      title={`${task.id} · ${formatShortDateTime(run.logicalDate)} · ${option?.label ?? instance?.state}`}
                      className={`block size-4 rounded-sm ${toneSwatch[option?.tone ?? 'neutral']} hover:ring-2 hover:ring-ring`}
                    >
                      <span className="sr-only">{option?.label}</span>
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
