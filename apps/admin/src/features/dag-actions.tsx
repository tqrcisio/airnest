import { useState } from 'react';
import { CalendarRange, MoreHorizontal, Pause, Play, PlayCircle } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@airnest/ui/components/dropdown-menu';
import { useDagActions, useManifest } from '@/lib/queries';
import type { DagManifest } from '@/lib/types';
import { BackfillDialog } from './backfill-dialog';
import { TriggerDialog } from './trigger-dialog';

type DagActionsProps = { dag: DagManifest; isPaused: boolean; layout: 'menu' | 'buttons' };

export function DagActions({ dag, isPaused, layout }: DagActionsProps) {
  const manifest = useManifest();
  const { pause, unpause } = useDagActions(dag.id);
  const [triggering, setTriggering] = useState(false);
  const [confirmingPause, setConfirmingPause] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const canBackfill = dag.schedule !== null;
  const actions = manifest.data?.entities.find((entity) => entity.slug === 'dags')?.actions ?? [];
  const labelOf = (name: string) => actions.find((action) => action.name === name)?.label ?? name;
  const pauseConfirmation = actions.find((action) => action.name === 'pause')?.confirm;

  const togglePause = () => (isPaused ? unpause.mutate() : setConfirmingPause(true));

  return (
    <>
      {layout === 'buttons' ? (
        <div className="flex flex-wrap items-center gap-2">
          {canBackfill && (
            <Button variant="outline" onClick={() => setBackfilling(true)}>
              <CalendarRange data-icon="inline-start" />
              {labelOf('backfill')}
            </Button>
          )}
          <Button variant="outline" onClick={togglePause} disabled={pause.isPending || unpause.isPending}>
            {isPaused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
            {labelOf(isPaused ? 'unpause' : 'pause')}
          </Button>
          <Button onClick={() => setTriggering(true)}>
            <PlayCircle data-icon="inline-start" />
            {labelOf('trigger')}
          </Button>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${dag.id}`} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTriggering(true)}>
              <PlayCircle />
              {labelOf('trigger')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={togglePause}>
              {isPaused ? <Play /> : <Pause />}
              {labelOf(isPaused ? 'unpause' : 'pause')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <TriggerDialog dag={dag} open={triggering} onOpenChange={setTriggering} />
      {canBackfill && <BackfillDialog dagId={dag.id} open={backfilling} onOpenChange={setBackfilling} />}

      <AlertDialog open={confirmingPause} onOpenChange={setConfirmingPause}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause {dag.id}?</AlertDialogTitle>
            {pauseConfirmation && <AlertDialogDescription>{pauseConfirmation}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                pause.mutate();
                setConfirmingPause(false);
              }}
            >
              {labelOf('pause')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
