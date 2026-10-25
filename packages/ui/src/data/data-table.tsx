'use client';

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../primitives/button.tsx';
import { Spinner } from '../feedback/status.tsx';
import { cn } from '../cn.ts';

export interface DataTableSort {
  key: string;
  direction: 'asc' | 'desc';
}

export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
}

export interface DataTableProps<Row> {
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  selectedIds?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  isRowSelectable?: (row: Row) => boolean;
  selectionLabel?: string;
  rowSelectionLabel?: (row: Row) => string;
  loading?: boolean;
  error?: string | null;
  emptyLabel: ReactNode;
  loadingLabel: ReactNode;
  retryLabel?: string;
  onRetry?: () => void;
}

function nextSort(key: string, current: DataTableSort | null | undefined): DataTableSort | null {
  if (current?.key !== key) return { key, direction: 'asc' };
  return current.direction === 'asc' ? { key, direction: 'desc' } : null;
}

function columnClass<Row>(column: DataTableColumn<Row>) {
  return cn(
    'px-4 text-left',
    column.align === 'right' && 'text-right',
    column.align === 'center' && 'text-center',
    column.key === 'actions' && 'sticky right-0 z-10 w-16 bg-card text-center',
  );
}

function SortControl<Row>({
  column,
  sort,
  onSortChange,
}: {
  sort: DataTableSort | null | undefined;
  onSortChange: ((sort: DataTableSort | null) => void) | undefined;
  column: DataTableColumn<Row>;
}) {
  if (!column.sortable || !onSortChange) return column.header;
  const active = sort?.key === column.key;
  return (
    <Button
      variant="ghost"
      size="xs"
      className="-ms-1 font-medium"
      onClick={() => onSortChange(nextSort(column.key, sort))}
    >
      {column.header}
      {active ? (
        sort.direction === 'asc' ? (
          <ArrowUpIcon />
        ) : (
          <ArrowDownIcon />
        )
      ) : (
        <ChevronsUpDownIcon className="text-muted-foreground" />
      )}
    </Button>
  );
}

function TableStatus<Row>({
  loading,
  error,
  loadingLabel,
  emptyLabel,
  retryLabel,
  onRetry,
}: DataTableProps<Row>) {
  if (loading)
    return (
      <span role="status" className="inline-flex items-center gap-2">
        <Spinner />
        {loadingLabel}
      </span>
    );
  if (error)
    return (
      <div role="alert" className="flex items-center justify-center gap-2 text-destructive">
        <span>{error}</span>
        {onRetry && retryLabel ? (
          <Button variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
      </div>
    );
  return emptyLabel;
}

interface TableSelection {
  enabled: boolean;
  selected: ReadonlySet<string>;
  selectable: readonly string[];
  all: boolean;
  some: boolean;
  selectRow: (id: string, checked: boolean) => void;
}

function TableHeader<Row>({
  props,
  selection,
}: {
  props: DataTableProps<Row>;
  selection: TableSelection;
}) {
  return (
    <thead className="bg-card">
      <tr className="border-b border-border/60">
        {selection.enabled ? (
          <th className="w-10 px-4">
            <input
              type="checkbox"
              aria-label={props.selectionLabel}
              checked={selection.all}
              disabled={props.loading === true || selection.selectable.length === 0}
              ref={(node) => {
                if (node) node.indeterminate = selection.some && !selection.all;
              }}
              onChange={() =>
                props.onSelectionChange?.(selection.all ? [] : [...selection.selectable])
              }
              className="size-3.5 rounded-sm accent-primary"
            />
          </th>
        ) : null}
        {props.columns.map((column) => (
          <th
            key={column.key}
            scope="col"
            className={cn('h-10 font-medium whitespace-nowrap', columnClass(column))}
            aria-sort={
              column.sortable
                ? props.sort?.key === column.key
                  ? props.sort.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
                : undefined
            }
          >
            <SortControl column={column} sort={props.sort} onSortChange={props.onSortChange} />
          </th>
        ))}
      </tr>
    </thead>
  );
}

function TableRows<Row>({
  props,
  selection,
}: {
  props: DataTableProps<Row>;
  selection: TableSelection;
}) {
  return props.rows.map((row) => (
    <tr
      key={props.rowKey(row)}
      className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-muted/50 data-[selected=true]:bg-muted/50"
      data-selected={selection.selected.has(props.rowKey(row)) || undefined}
    >
      {selection.enabled ? (
        <td className="w-10 px-4">
          <input
            type="checkbox"
            aria-label={props.rowSelectionLabel?.(row)}
            checked={selection.selected.has(props.rowKey(row))}
            disabled={props.isRowSelectable?.(row) === false}
            onChange={(event) =>
              selection.selectRow(props.rowKey(row), event.currentTarget.checked)
            }
            className="size-3.5 rounded-sm accent-primary"
          />
        </td>
      ) : null}
      {props.columns.map((column) => (
        <td
          key={column.key}
          className={cn('h-12 py-2 align-middle whitespace-nowrap', columnClass(column))}
        >
          {column.cell(row)}
        </td>
      ))}
    </tr>
  ));
}

export function DataTable<Row>(props: DataTableProps<Row>) {
  const hasVisibleData = props.loading !== true && !props.error;
  const visibleRows = hasVisibleData ? props.rows : [];
  const selectable = visibleRows
    .filter((row) => props.isRowSelectable?.(row) !== false)
    .map(props.rowKey);
  const selected = new Set(props.selectedIds);
  const selection: TableSelection = {
    enabled: props.selectedIds !== undefined && props.onSelectionChange !== undefined,
    selectable,
    selected,
    all: selectable.length > 0 && selectable.every((id) => selected.has(id)),
    some: selectable.some((id) => selected.has(id)),
    selectRow(id, checked) {
      const visible = selectable.filter((key) => selected.has(key) && key !== id);
      props.onSelectionChange?.(checked ? [...visible, id] : visible);
    },
  };
  return (
    <div
      role="region"
      tabIndex={0}
      className="w-full overflow-x-auto rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table
        data-slot="data-table"
        className="w-full caption-bottom text-sm"
        aria-busy={props.loading}
      >
        <TableHeader props={props} selection={selection} />
        <tbody>
          {!hasVisibleData || visibleRows.length === 0 ? (
            <tr>
              <td
                colSpan={props.columns.length + Number(selection.enabled)}
                className="h-24 px-4 text-center text-muted-foreground"
              >
                <TableStatus {...props} />
              </td>
            </tr>
          ) : (
            <TableRows props={props} selection={selection} />
          )}
        </tbody>
      </table>
    </div>
  );
}
