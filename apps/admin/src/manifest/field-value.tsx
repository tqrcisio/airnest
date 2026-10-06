import { Link } from '@tanstack/react-router';
import { Badge } from '@airnest/ui/components/badge';
import { formatDateTime } from '@/lib/format';
import type { FieldManifest } from '@/lib/types';
import { optionOf, toneBadge } from './tone';

export function StateBadge({ field, value }: { field: FieldManifest | undefined; value: string }) {
  const option = optionOf(field, value);
  return <Badge className={toneBadge[option?.tone ?? 'neutral']}>{option?.label ?? value}</Badge>;
}

function isAbsent(value: unknown) {
  return value === null || value === undefined || value === '';
}

export function FieldValue({ field, value }: { field: FieldManifest; value: unknown }) {
  if (isAbsent(value)) return <span className="text-muted-foreground">-</span>;

  switch (field.kind) {
    case 'state':
    case 'enum':
      return <StateBadge field={field} value={String(value)} />;
    case 'code':
      return <span className="font-mono text-sm break-all text-foreground/90">{String(value)}</span>;
    case 'datetime':
      return <span className="tabular-nums">{formatDateTime(String(value))}</span>;
    case 'number':
      return <span className="tabular-nums">{String(value)}</span>;
    case 'boolean':
      return <span>{value ? 'Yes' : 'No'}</span>;
    case 'relation':
      return field.relation === 'dags' ? (
        <Link
          to="/dags/$dagId"
          params={{ dagId: String(value) }}
          className="font-mono text-sm text-primary hover:underline"
        >
          {String(value)}
        </Link>
      ) : (
        <span className="font-mono text-sm">{String(value)}</span>
      );
    case 'json':
      return <pre className="font-mono text-xs whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>;
    default:
      return <span className="break-words">{String(value)}</span>;
  }
}
