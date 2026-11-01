import type { PartitionInput } from '@airnest/postgres';

export const PARTITIONS = Symbol('airnest:partitions');

export type PartitionList = (string | PartitionInput)[];

type PartitionsMethod = () => PartitionList | Promise<PartitionList>;

export function Partitions() {
  return <TMethod extends PartitionsMethod>(
    _target: object,
    _key: string | symbol,
    descriptor: TypedPropertyDescriptor<TMethod>,
  ) => {
    Reflect.defineMetadata(PARTITIONS, true, descriptor.value!);
  };
}

export function normalizePartitions(list: PartitionList): PartitionInput[] {
  const byKey = new Map<string, PartitionInput>();
  for (const entry of list) {
    const partition = typeof entry === 'string' ? { key: entry } : entry;
    byKey.set(partition.key, partition);
  }
  return [...byKey.values()];
}
