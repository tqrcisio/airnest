import { useState } from 'react';
import { Button } from '@airnest/ui/components/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@airnest/ui/components/dialog';
import { Field, FieldGroup, FieldLabel } from '@airnest/ui/components/field';
import { Input } from '@airnest/ui/components/input';
import { useBackfill } from '@/lib/queries';
import type { DagManifest } from '@/lib/types';
import { PartitionSelect } from './partition-select';

type BackfillDialogProps = { dag: DagManifest; open: boolean; onOpenChange: (open: boolean) => void };

const toIso = (local: string) => new Date(local).toISOString();

export function BackfillDialog({ dag, open, onOpenChange }: BackfillDialogProps) {
  const backfill = useBackfill(dag.id);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [partition, setPartition] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await backfill.mutateAsync({ from: toIso(from), to: toIso(to), partition: partition || undefined });
  };

  const close = (next: boolean) => {
    if (!next) backfill.reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Backfill {dag.id}</DialogTitle>
        </DialogHeader>
        {backfill.data ? (
          <p className="text-sm">
            {backfill.data.created.length} runs created
            {backfill.data.skipped > 0 && `, ${backfill.data.skipped} already existed`}.
          </p>
        ) : (
          <form id="backfill-form" onSubmit={submit}>
            <FieldGroup>
              {dag.partitions && (
                <Field>
                  <FieldLabel htmlFor="backfill-partition">Partition</FieldLabel>
                  <PartitionSelect
                    id="backfill-partition"
                    partitions={dag.partitions}
                    value={partition}
                    onChange={setPartition}
                    allLabel="All partitions"
                  />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="backfill-from">From</FieldLabel>
                <Input
                  id="backfill-from"
                  type="datetime-local"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="backfill-to">To</FieldLabel>
                <Input
                  id="backfill-to"
                  type="datetime-local"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </Field>
            </FieldGroup>
            {backfill.error && <p className="mt-4 text-sm text-destructive">{backfill.error.message}</p>}
          </form>
        )}
        <DialogFooter>
          {backfill.data ? (
            <Button onClick={() => close(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" form="backfill-form" disabled={backfill.isPending}>
                Create runs
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
