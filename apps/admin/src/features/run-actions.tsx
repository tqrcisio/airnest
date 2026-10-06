import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@airnest/ui/components/alert-dialog';
import { Button } from '@airnest/ui/components/button';
import { useRunActions } from '@/lib/queries';
import type { EntityManifest, Run } from '@/lib/types';

const failedStates = new Set(['failed', 'upstream_failed']);
const activeStates = new Set(['scheduled', 'queued', 'running', 'deferred', 'up_for_retry']);

export const isTaskActive = (state: string) => activeStates.has(state);

export function RunActions({ run, entity }: { run: Run; entity: EntityManifest }) {
  const clear = useRunActions(run.runId);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const action = (name: string) => entity.actions.find((candidate) => candidate.name === name);
  const busy = run.tasks.some((task) => isTaskActive(task.state));
  const hasFailures = run.tasks.some((task) => failedStates.has(task.state));
  const rerunAll = action('clear-all');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasFailures && (
        <Button variant="outline" disabled={busy || clear.isPending} onClick={() => clear.mutate({ onlyFailed: true })}>
          <RotateCcw data-icon="inline-start" />
          {action('clear-failed')?.label}
        </Button>
      )}
      <Button variant="outline" disabled={busy || clear.isPending} onClick={() => setConfirmingAll(true)}>
        {rerunAll?.label}
      </Button>
      {clear.error && <p className="w-full text-sm text-destructive">{clear.error.message}</p>}

      <AlertDialog open={confirmingAll} onOpenChange={setConfirmingAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{rerunAll?.label}?</AlertDialogTitle>
            {rerunAll?.confirm && <AlertDialogDescription>{rerunAll.confirm}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clear.mutate({});
                setConfirmingAll(false);
              }}
            >
              {rerunAll?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RerunTaskButton({
  runId,
  taskId,
  state,
  label,
}: {
  runId: string;
  taskId: string;
  state: string;
  label: string;
}) {
  const clear = useRunActions(runId);
  if (isTaskActive(state) || state === 'pending') return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${label}: ${taskId}`}
      title={label}
      disabled={clear.isPending}
      onClick={() => clear.mutate({ taskIds: [taskId], downstream: true })}
    >
      <RotateCcw />
    </Button>
  );
}
