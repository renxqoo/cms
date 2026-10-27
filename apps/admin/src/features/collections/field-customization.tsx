'use client';

import { z } from 'zod';
import type { ReactNode } from 'react';
import { useShell } from '../../components/shell/shell-provider';
import type { Collection, CollectionField } from '../../contracts/content';
import { editorNodeSchema } from '../../contracts/editor';
import { RegisteredField } from '../admin-components/renderers';
import type { FieldData, JsonValue } from '../fields/types';
import type { FilterDraft } from './query-filter';

function fieldNode(field: CollectionField) {
  return editorNodeSchema.parse({
    id: field.id,
    name: field.path,
    path: field.path,
    type: field.type,
    label: field.label,
    required: field.required,
    localized: field.localized,
    write: 'allowed',
    constraints: field.options ? { options: field.options } : {},
  });
}
export function FieldFilter({
  collection,
  field,
  draft,
  onChange,
  children,
}: {
  collection: Collection;
  field: CollectionField | undefined;
  draft: Extract<FilterDraft, { kind: 'condition' }>;
  onChange: (draft: FilterDraft) => void;
  children: ReactNode;
}) {
  const locale = useShell((state) => state.locale);
  if (!field) return children;
  return (
    <RegisteredField
      slot="Filter"
      component={field.components?.Filter}
      node={fieldNode(field)}
      id={`filter-${field.id}`}
      name={field.path}
      value={draft.value}
      data={{}}
      locale={locale}
      readOnly={false}
      error={undefined}
      operator={draft.operator}
      componentNamespace={`${field.path}#${field.id}`}
      {...(collection.componentProps ? { componentProps: collection.componentProps } : {})}
      onChange={(value) =>
        onChange({ ...draft, value: typeof value === 'string' ? value : JSON.stringify(value) })
      }
    >
      {children}
    </RegisteredField>
  );
}
export function FieldDiff({
  collection,
  change,
  locale,
  componentProps,
  children,
}: {
  collection: Collection | undefined;
  change: { field: string; before: unknown; after: unknown };
  locale: string;
  componentProps: Record<string, FieldData> | undefined;
  children: ReactNode;
}) {
  const field = collection?.fields.find((entry) => entry.path === change.field);
  if (!field) return children;
  return (
    <RegisteredField
      slot="Diff"
      component={field.components?.Diff}
      node={fieldNode(field)}
      id={`diff-${field.id}`}
      name={field.path}
      data={{}}
      value={undefined}
      locale={locale}
      readOnly
      error={undefined}
      beforeValue={jsonValue(change.before)}
      afterValue={jsonValue(change.after)}
      componentNamespace={`${field.path}#${field.id}`}
      {...(componentProps ? { componentProps } : {})}
      onChange={() => {}}
    >
      {children}
    </RegisteredField>
  );
}
function jsonValue(value: unknown): JsonValue | undefined {
  const parsed = editorValue.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
const editorValue = z.json();
