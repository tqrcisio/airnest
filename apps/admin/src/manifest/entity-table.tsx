import type { ReactNode } from 'react';
import { getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@airnest/ui/components/table';
import type { EntityManifest } from '@/lib/types';
import { FieldValue } from './field-value';

type EntityTableProps<Row> = {
  entity: EntityManifest;
  rows: Row[];
  rowKey: (row: Row) => string;
  identity?: (row: Row, content: ReactNode) => ReactNode;
  actions?: (row: Row) => ReactNode;
  empty: string;
};

export function EntityTable<Row extends Record<string, unknown>>({
  entity,
  rows,
  rowKey,
  identity,
  actions,
  empty,
}: EntityTableProps<Row>) {
  const listed = entity.fields.filter((field) => field.list);
  const columns: ColumnDef<Row>[] = listed.map((field) => ({ id: field.name, header: field.label }));
  if (actions) columns.push({ id: 'actions', header: '' });

  const renderCell = (columnId: string, row: Row) => {
    if (columnId === 'actions') return actions?.(row);
    const field = listed.find((candidate) => candidate.name === columnId)!;
    const content = <FieldValue field={field} value={row[field.name]} />;
    return field === listed[0] && identity ? identity(row, content) : content;
  };

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getRowId: rowKey });

  return (
    <Table className="list-table">
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead key={header.id} data-column={header.id}>
                {String(header.column.columnDef.header)}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">
              {empty}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} data-column={cell.column.id}>
                  {renderCell(cell.column.id, row.original)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
