import { Loader2 } from 'lucide-react';
import { useAttempts } from '@/lib/queries';
import { formatDateTime, formatDuration } from '@/lib/format';
import { useEntity } from '@/manifest/use-entity';
import { StateBadge } from '@/manifest/field-value';

export function Attempts({ runId, taskId }: { runId: string; taskId: string }) {
  const attempts = useAttempts(runId, taskId);
  const { entity } = useEntity('attempts');
  const outcome = entity?.fields.find((field) => field.name === 'state');

  if (attempts.isPending) return <Loader2 className="mx-auto my-6 size-4 animate-spin" />;
  if (attempts.isError) return <p className="py-6 text-center text-sm text-destructive">Could not load the attempts</p>;
  if (attempts.data.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No finished attempt yet.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {attempts.data.map((attempt) => (
        <li key={attempt.attemptId} className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium tabular-nums">Attempt {attempt.tryNumber}</span>
            <StateBadge field={outcome} value={attempt.state} />
            <span className="text-muted-foreground tabular-nums">{formatDateTime(attempt.startedAt)}</span>
            <span className="text-muted-foreground tabular-nums">
              {formatDuration(attempt.startedAt, attempt.finishedAt)}
            </span>
            <span className="font-mono text-xs text-muted-foreground break-all">{attempt.workerId}</span>
          </div>
          {attempt.error && <p className="font-mono text-sm text-destructive break-words">{attempt.error}</p>}
        </li>
      ))}
    </ul>
  );
}
