import { fieldPaths } from '../fields/structure.ts';
import { ownValue, objectValue } from '../fields/json-value.ts';
import { policyScope } from '../hooks/invoke.ts';
import { collectionMetadata } from '../fields/policy-metadata.ts';
import { policyContext, queryDefaults } from '../runtime.ts';
import { targetState, denied } from '../documents/relation-scopes.ts';
import { storedViews } from '../documents/stored-views.ts';
import { valueAtPath } from '../documents/data-path.ts';
import type { ContentState, ContentRuntime } from '../types.ts';
import type { JsonValue } from '../definition.ts';
import type { DocumentView, RelationScope } from '../model.ts';

function referenceGroups(
  state: ContentState,
  input: { field: string; values: readonly JsonValue[] },
) {
  const field = fieldPaths(state.collection.fields).find(
    (entry) => entry.path === input.field,
  )?.field;
  const grouped = new Map<string, string[]>();
  if (!field || !['relationship', 'upload'].includes(field.type)) return grouped;
  for (const value of input.values)
    if (objectValue(value)) {
      const collection = ownValue(value, 'collection');
      const id = ownValue(value, 'id');
      if (
        typeof collection === 'string' &&
        typeof id === 'string' &&
        field.relationTo?.includes(collection)
      ) {
        const ids = grouped.get(collection) ?? [];
        ids.push(id);
        grouped.set(collection, ids);
      }
    }
  return grouped;
}

export async function groupingLabels(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    field: string;
    values: readonly JsonValue[];
    relationScopes: readonly RelationScope[];
  },
) {
  const labels = new Map<string, string>();
  for (const [collection, ids] of referenceGroups(state, input)) {
    try {
      const reader = await targetState(state, { runtime: input.runtime, collection });
      const result = await input.runtime.store.queryDocuments(state.tx, {
        collection,
        query: {
          ...queryDefaults(reader, input.runtime),
          where: { field: 'id', operator: 'in', value: ids },
          pageSize: ids.length,
          sort: [{ field: 'id', order: 'asc' }],
          ...(reader.predicate ? { policy: reader.predicate } : {}),
        },
        queryableFields: [],
        relationScopes: input.relationScopes,
        limits: input.runtime.limits,
      });
      const metadata = await collectionMetadata({
        ...policyScope(reader),
        collection: reader.collection,
        context: policyContext(reader),
      });
      const views = await storedViews(reader, result.rows, { runtime: input.runtime });
      const paths = metadata.admin?.useAsTitle
        ? [metadata.admin.useAsTitle]
        : metadata.fields.map((field) => field.path);
      for (const view of views) {
        const label = readableTitle(view, paths);
        if (label !== undefined) labels.set(`${collection}:${view.id}`, label);
      }
    } catch (error) {
      if (!denied(error)) throw error;
    }
  }
  return labels;
}

function readableTitle(view: DocumentView, paths: readonly string[]): string | undefined {
  for (const path of paths) {
    const value = valueAtPath(view.data, path);
    if (
      (typeof value === 'string' && value.length > 0) ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
      return String(value);
  }
  return undefined;
}

export function groupingLabel(
  labels: ReadonlyMap<string, string>,
  value: JsonValue,
): string | undefined {
  if (!objectValue(value)) return undefined;
  const collection = ownValue(value, 'collection');
  const id = ownValue(value, 'id');
  return typeof collection === 'string' && typeof id === 'string'
    ? labels.get(`${collection}:${id}`)
    : undefined;
}
