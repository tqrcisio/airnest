import { Loader2 } from 'lucide-react';
import { useLogs } from '@/lib/queries';
import type { LogLine } from '@/lib/types';

const levelClass: Record<LogLine['level'], string> = {
  log: 'text-foreground/90',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-destructive',
};

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function TaskLogs({ runId, taskId, live }: { runId: string; taskId: string; live: boolean }) {
  const logs = useLogs(runId, taskId, live);

  if (logs.isPending) return <Loader2 className="mx-auto my-6 size-4 animate-spin" />;
  if (logs.isError) return <p className="py-6 text-center text-sm text-destructive">Could not load the logs</p>;
  if (logs.data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {live ? 'Waiting for output…' : 'This task logged nothing.'}
      </p>
    );
  }

  return (
    <div className="max-h-96 overflow-auto rounded-xl border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
      {logs.data.map((line) => (
        <div key={line.seq} className="flex gap-3">
          <span className="shrink-0 text-muted-foreground tabular-nums">{time.format(new Date(line.at))}</span>
          <span className="shrink-0 text-muted-foreground tabular-nums">#{line.tryNumber}</span>
          <span className={`break-words whitespace-pre-wrap ${levelClass[line.level]}`}>{line.message}</span>
        </div>
      ))}
    </div>
  );
}
