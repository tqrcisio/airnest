import { useState } from 'react';
import { Button } from '@airnest/ui/components/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@airnest/ui/components/dialog';
import { Field, FieldGroup, FieldLabel } from '@airnest/ui/components/field';
import { Input } from '@airnest/ui/components/input';
import { useBackfill } from '@/lib/queries';

type BackfillDialogProps = { dagId: string; open: boolean; onOpenChange: (open: boolean) => void };

const toIso = (local: string) => new Date(local).toISOString();

export function BackfillDialog({ dagId, open, onOpenChange }: BackfillDialogProps) {
  const backfill = useBackfill(dagId);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await backfill.mutateAsync({ from: toIso(from), to: toIso(to) });
  };

  const close = (next: boolean) => {
    if (!next) backfill.reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Backfill {dagId}</DialogTitle>
        </DialogHeader>
        {backfill.data ? (
          <p className="text-sm">
            {backfill.data.created.length} runs created
            {backfill.data.skipped > 0 && `, ${backfill.data.skipped} already existed`}.
          </p>
        ) : (
          <form id="backfill-form" onSubmit={submit}>
            <FieldGroup>
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
