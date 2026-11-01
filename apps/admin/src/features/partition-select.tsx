import type { DagManifest } from '@/lib/types';

export const selectClass =
  'h-9 w-full rounded-3xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

type PartitionSelectProps = {
  id: string;
  partitions: NonNullable<DagManifest['partitions']>;
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
};

export function PartitionSelect({ id, partitions, value, onChange, allLabel }: PartitionSelectProps) {
  return (
    <select
      id={id}
      className={selectClass}
      required={!allLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{allLabel ?? 'Choose a partition'}</option>
      {partitions.map((partition) => (
        <option key={partition.key} value={partition.key}>
          {partition.label ?? partition.key}
        </option>
      ))}
    </select>
  );
}
