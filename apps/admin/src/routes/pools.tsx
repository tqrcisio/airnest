import { createFileRoute } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Crumbs, PageState } from '@/features/crumbs';
import { usePools } from '@/lib/queries';
import { EntityTable } from '@/manifest/entity-table';
import { useEntity } from '@/manifest/use-entity';

function PoolsPage() {
  const pools = usePools();
  const { entity } = useEntity('pools');
  return (
    <div className="space-y-6">
      <Crumbs items={[{ label: 'Pools' }]} />
      {pools.isPending || !entity ? (
        <Loader2 className="mx-auto my-10 size-4 animate-spin" />
      ) : pools.isError ? (
        <PageState text="Could not load the pools" tone="error" />
      ) : (
        <EntityTable
          entity={entity}
          rows={pools.data}
          rowKey={(pool) => pool.name}
          empty="No pool declared. Add them to AirnestModule.forRoot({ pools })."
        />
      )}
    </div>
  );
}

export const Route = createFileRoute('/pools')({ component: PoolsPage });
