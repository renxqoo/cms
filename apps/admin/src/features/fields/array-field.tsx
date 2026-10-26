'use client';

import { useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { SortableList } from '@new-cms/ui/data';
import { NativeSelect } from '@new-cms/ui/forms';
import { addFieldRow, moveFieldRow, rowData } from './data';
import { newFieldData } from './initialize-data';
import { useFieldValue } from './field-context';
import type { RenderChildren } from './field-context';
import { fieldSorting } from './sorting';
import type { ScalarProps } from './scalar-fields';
import type { FieldData, JsonValue } from './types';

function rowIdentity(row: FieldData) {
  return typeof row['id'] === 'string' ? row['id'] : '';
}

function invalidRows(value: JsonValue | undefined, rows: FieldData[]) {
  return (
    rows.some((row) => typeof row['id'] !== 'string') ||
    (Array.isArray(value) && rows.length !== value.length)
  );
}

export function ArrayField({
  node,
  location,
  readOnly,
  renderChildren,
}: ScalarProps & { renderChildren: RenderChildren }) {
  const field = useFieldValue(location);
  const rows = rowData(field.value);
  const [blockType, setBlockType] = useState(node.blocks?.[0]?.key ?? '');
  const invalid = invalidRows(field.value, rows);
  const maximum = rows.length >= (node.constraints.max ?? Number.POSITIVE_INFINITY);
  const selectedBlock = node.blocks?.find((block) => block.key === blockType);
  const cannotAdd = maximum || invalid || (node.type === 'blocks' && !selectedBlock);
  function add() {
    if (readOnly || maximum || invalid || (node.type === 'blocks' && !selectedBlock)) return;
    const defaults = newFieldData(
      node.type === 'blocks' ? (selectedBlock?.children ?? []) : (node.children ?? []),
      () => crypto.randomUUID(),
    );
    field.change(
      addFieldRow({
        value: rows,
        defaults,
        id: crypto.randomUUID(),
        ...(node.type === 'blocks' ? { blockType } : {}),
      }),
    );
  }
  function rowLabel(row: FieldData) {
    const block = node.blocks?.find((candidate) => candidate.key === row['blockType']);
    return `${block?.label ?? field.t.row} ${rows.indexOf(row) + 1}`;
  }
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-border/60 p-4">
      <legend className="px-1 text-sm font-medium">{node.label}</legend>
      {invalid ? (
        <p role="alert" className="text-sm text-destructive">
          {field.t.missingId}
        </p>
      ) : (
        <SortableList
          items={rows}
          getId={(row) => rowIdentity(row)}
          getItemLabel={rowLabel}
          onChange={field.change}
          labels={fieldSorting(field.t, node.label)}
          disabled={readOnly}
          renderItem={(row, handle) => {
            const index = rows.indexOf(row);
            const block = node.blocks?.find((candidate) => candidate.key === row['blockType']);
            return (
              <div className="min-w-0 rounded-lg border border-border/60 bg-card p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {handle}
                    {rowLabel(row)}
                  </span>
                  {!readOnly ? (
                    <div className="flex gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={index === 0}
                        aria-label={`${field.t.moveUp} ${rowLabel(row)}`}
                        onClick={() => field.change(moveFieldRow(rows, index, index - 1))}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={index === rows.length - 1}
                        aria-label={`${field.t.moveDown} ${rowLabel(row)}`}
                        onClick={() => field.change(moveFieldRow(rows, index, index + 1))}
                      >
                        <ArrowDownIcon />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`${field.t.remove} ${rowLabel(row)}`}
                        onClick={() => field.change(rows.filter((candidate) => candidate !== row))}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  ) : null}
                </div>
                {node.type === 'blocks' && !block ? (
                  <pre className="overflow-x-auto text-xs">
                    {field.t.unknownBlock}
                    {'\n'}
                    {JSON.stringify(row, null, 2)}
                  </pre>
                ) : (
                  renderChildren(
                    node.type === 'blocks' ? (block?.children ?? []) : (node.children ?? []),
                    {
                      path: [...location.path, index],
                      identity: `${location.identity}/${rowIdentity(row)}`,
                      sourcePath: `${location.sourcePath}.${rowIdentity(row)}`,
                    },
                    readOnly,
                  )
                )}
              </div>
            );
          }}
        />
      )}
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          {node.type === 'blocks' ? (
            <NativeSelect
              aria-label={`${node.label} ${field.t.chooseBlock}`}
              value={blockType}
              onChange={(event) => setBlockType(event.currentTarget.value)}
            >
              {node.blocks?.map((block) => (
                <option key={block.key} value={block.key}>
                  {block.label}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          <Button variant="outline" size="sm" onClick={add} disabled={cannotAdd}>
            <PlusIcon />
            {field.t.add}
          </Button>
        </div>
      ) : null}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{field.t.empty}</p> : null}
    </fieldset>
  );
}
