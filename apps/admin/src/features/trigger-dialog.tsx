import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@airnest/ui/components/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@airnest/ui/components/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@airnest/ui/components/field';
import { Input } from '@airnest/ui/components/input';
import { Switch } from '@airnest/ui/components/switch';
import { Textarea } from '@airnest/ui/components/textarea';
import { useDagActions } from '@/lib/queries';
import type { DagManifest } from '@/lib/types';
import { InvalidParam, paramFields, toParams, type ParamField } from './params-form';
import { PartitionSelect, selectClass } from './partition-select';

type TriggerDialogProps = { dag: DagManifest; open: boolean; onOpenChange: (open: boolean) => void };

export function TriggerDialog({ dag, open, onOpenChange }: TriggerDialogProps) {
  const fields = paramFields(dag.params);
  const { trigger } = useDagActions(dag.id);
  const navigate = useNavigate();
  const [fieldError, setFieldError] = useState<InvalidParam | null>(null);
  const [partition, setPartition] = useState('');
  const form = useForm<Record<string, string | boolean>>({
    defaultValues: Object.fromEntries(fields.map((field) => [field.name, field.initial])),
  });

  const submit = form.handleSubmit(async (values) => {
    setFieldError(null);
    let params: Record<string, unknown>;
    try {
      params = toParams(fields, values);
    } catch (error) {
      if (error instanceof InvalidParam) return setFieldError(error);
      throw error;
    }
    const run = await trigger.mutateAsync({ params, partition: dag.partitions ? partition : undefined });
    onOpenChange(false);
    await navigate({ to: '/dags/$dagId/runs/$runId', params: { dagId: dag.id, runId: run.runId } });
  });

  const renderControl = (field: ParamField) => (
    <Controller
      name={field.name}
      control={form.control}
      render={({ field: control }) => {
        if (field.control === 'boolean') {
          return <Switch id={field.name} checked={Boolean(control.value)} onCheckedChange={control.onChange} />;
        }
        if (field.control === 'choice') {
          return (
            <select id={field.name} className={selectClass} value={String(control.value)} onChange={control.onChange}>
              {field.choices.map((choice) => (
                <option key={choice}>{choice}</option>
              ))}
            </select>
          );
        }
        if (field.control === 'json') {
          return (
            <Textarea
              id={field.name}
              className="font-mono text-sm"
              rows={4}
              {...control}
              value={String(control.value)}
            />
          );
        }
        return (
          <Input
            id={field.name}
            inputMode={field.control === 'number' ? 'decimal' : undefined}
            placeholder={field.control === 'list' ? 'Comma separated' : undefined}
            {...control}
            value={String(control.value)}
          />
        );
      }}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Trigger {dag.id}</DialogTitle>
        </DialogHeader>
        <form id="trigger-form" onSubmit={submit}>
          {dag.partitions && (
            <Field className="mb-4">
              <FieldLabel htmlFor="trigger-partition">Partition</FieldLabel>
              <PartitionSelect
                id="trigger-partition"
                partitions={dag.partitions}
                value={partition}
                onChange={setPartition}
              />
            </Field>
          )}
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">This DAG takes no parameters.</p>
          ) : (
            <FieldGroup>
              {fields.map((field) => (
                <Field key={field.name} orientation={field.control === 'boolean' ? 'horizontal' : 'vertical'}>
                  <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
                  {renderControl(field)}
                  {fieldError?.field === field.name && <FieldError>{fieldError.message}</FieldError>}
                </Field>
              ))}
            </FieldGroup>
          )}
          {trigger.error && <p className="mt-4 text-sm text-destructive">{trigger.error.message}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="trigger-form" disabled={trigger.isPending}>
            Trigger run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
