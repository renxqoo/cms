'use client';

import type { ReactNode } from 'react';
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { useFieldValue } from './field-context';
import type { RenderChildren } from './field-context';
import { FieldRowSlot } from './configured-field';
import { moveFieldRow } from './data';
import type { ScalarProps } from './scalar-fields';
import type { FieldData } from './types';
import type { EditorNode } from '../../contracts/editor';

interface RowProps extends ScalarProps {
  row: FieldData;
  rows: FieldData[];
  index: number;
  renderChildren: RenderChildren;
}
export function arrayRowLabel(
  node: EditorNode,
  row: FieldData,
  input: { index: number; fallback: string },
) {
  const block = node.blocks?.find((candidate) => candidate.key === row['blockType']);
  return `${block?.label ?? input.fallback} ${input.index + 1}`;
}
export function ArrayRow({ handle, ...props }: RowProps & { handle: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          {handle}
          <RowHeading {...props} />
        </span>
        <RowActions {...props} />
      </div>
      <RowContents {...props} />
    </div>
  );
}
function RowHeading(props: RowProps) {
  const field = useFieldValue(props.location);
  const block = props.node.blocks?.find((candidate) => candidate.key === props.row['blockType']);
  return (
    <FieldRowSlot
      {...props}
      readOnly
      row={props.row}
      slot="RowLabel"
      component={props.node.components?.RowLabel}
    >
      <FieldRowSlot
        {...props}
        readOnly
        row={props.row}
        slot="Label"
        component={block?.components?.Label}
        {...(block ? { blockId: block.id } : {})}
      >
        {arrayRowLabel(props.node, props.row, { index: props.index, fallback: field.t.row })}
      </FieldRowSlot>
    </FieldRowSlot>
  );
}
function RowActions({ node, location, readOnly, row, rows, index }: RowProps) {
  const field = useFieldValue(location);
  const label = arrayRowLabel(node, row, { index, fallback: field.t.row });
  if (readOnly) return null;
  return (
    <div className="flex gap-1">
      <Button
        size="icon-sm"
        variant="ghost"
        disabled={index === 0}
        aria-label={`${field.t.moveUp} ${label}`}
        onClick={() => field.change(moveFieldRow(rows, index, index - 1))}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        disabled={index === rows.length - 1}
        aria-label={`${field.t.moveDown} ${label}`}
        onClick={() => field.change(moveFieldRow(rows, index, index + 1))}
      >
        <ArrowDownIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`${field.t.remove} ${label}`}
        onClick={() => field.change(rows.filter((candidate) => candidate !== row))}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
function RowContents(props: RowProps) {
  const { node, location, row, index, readOnly } = props;
  const field = useFieldValue(location);
  const block = node.blocks?.find((candidate) => candidate.key === row['blockType']);
  const rowId = typeof row['id'] === 'string' ? row['id'] : '';
  if (node.type === 'blocks' && !block)
    return (
      <pre className="overflow-x-auto text-xs">
        {field.t.unknownBlock}
        {'\n'}
        {JSON.stringify(row, null, 2)}
      </pre>
    );
  const children = node.type === 'blocks' ? (block?.children ?? []) : (node.children ?? []);
  return (
    <FieldRowSlot
      {...props}
      slot="Block"
      component={block?.components?.Block}
      {...(block ? { blockId: block.id } : {})}
    >
      {props.renderChildren(
        children,
        {
          path: [...location.path, index],
          identity: `${location.identity}/${rowId}`,
          sourcePath: `${location.sourcePath}.${rowId}`,
        },
        readOnly,
      )}
    </FieldRowSlot>
  );
}
