'use client';

import { useState } from 'react';
import { labelledOptions } from './option-labels';
import { ArrayRow, arrayRowLabel } from './array-row';
import { FieldLabel } from './configured-field';
import { PlusIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { SortableList } from '@new-cms/ui/data';
import { NativeSelect } from '@new-cms/ui/forms';
import { addFieldRow, rowData } from './data';
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
  const { availableBlocks, selectedBlock } = blockChoices(node, field.locale, blockType);
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
        ...(node.type === 'blocks' && selectedBlock ? { blockType: selectedBlock.key } : {}),
      }),
    );
  }
  function rowLabel(row: FieldData) {
    return arrayRowLabel(node, row, { index: rows.indexOf(row), fallback: field.t.row });
  }
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-border/60 p-4">
      <legend className="px-1 text-sm font-medium">
        <FieldLabel node={node} location={location} readOnly={readOnly} />
      </legend>
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
          renderItem={(row, handle) => (
            <ArrayRow
              node={node}
              location={location}
              readOnly={readOnly}
              renderChildren={renderChildren}
              row={row}
              rows={rows}
              index={rows.indexOf(row)}
              handle={handle}
            />
          )}
        />
      )}
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          {node.type === 'blocks' ? (
            <NativeSelect
              aria-label={`${node.label} ${field.t.chooseBlock}`}
              value={selectedBlock?.key ?? ''}
              onChange={(event) => setBlockType(event.currentTarget.value)}
            >
              {availableBlocks?.map((block) => (
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

function blockChoices(node: ScalarProps['node'], locale: string, blockType: string) {
  const allowedTypes = node.constraints.options
    ? new Set(labelledOptions(node.constraints.options, locale).map((option) => option.value))
    : undefined;
  const availableBlocks = node.blocks?.filter(
    (block) => !allowedTypes || allowedTypes.has(block.key),
  );
  const selectedBlock =
    availableBlocks?.find((block) => block.key === blockType) ?? availableBlocks?.[0];
  return { availableBlocks, selectedBlock };
}
