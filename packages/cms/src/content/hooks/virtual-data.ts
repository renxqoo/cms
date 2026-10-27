import { policyScope } from './invoke.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { projectData } from '../fields/policy-read.ts';
import { dataFields, fieldPaths } from '../fields/structure.ts';
import { readableJoinLocations } from '../joins/locations.ts';
import { joinQueryFor } from '../joins/context.ts';
import { objectValue } from '../fields/json-value.ts';
import { policyContext } from '../runtime.ts';
import { consumeVirtual, virtualTarget, virtualJoin } from './virtual-target.ts';
import { virtualPath } from './virtual.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData, FieldDefinition, JsonValue } from '../definition.ts';

interface Input {
  runtime: ContentRuntime;
  data: DocumentData;
  documentId?: string;
  policyData?: DocumentData;
}

async function relationship(
  state: ContentState,
  input: { runtime: ContentRuntime; value: JsonValue; path: string; depth: number },
): Promise<JsonValue | undefined> {
  if (Array.isArray(input.value)) {
    const values: JsonValue[] = [];
    for (const value of input.value) {
      const result = await relationship(state, { ...input, value });
      if (result !== undefined) values.push(result);
    }
    return values;
  }
  if (
    !objectValue(input.value) ||
    typeof input.value['collection'] !== 'string' ||
    typeof input.value['id'] !== 'string'
  )
    return undefined;
  consumeVirtual(state, input.runtime);
  if (input.depth >= input.runtime.limits.maxExpandDepth) fail('capacity_exceeded');
  const target = await virtualTarget(state, {
    runtime: input.runtime,
    collection: input.value['collection'],
    id: input.value['id'],
  });
  if (!target) return undefined;
  return resolvePath(target.state, {
    ...input,
    data: target.data,
    policyData: target.state.readPolicyData?.get(target.data) ?? target.data,
    documentId: input.value['id'],
    depth: input.depth + 1,
  });
}

async function joined(
  state: ContentState,
  input: Input & { field: FieldDefinition; path: string; sourcePath: string; depth: number },
): Promise<JsonValue | undefined> {
  if (!input.field.join || !input.documentId) return undefined;
  if (input.path !== '' && input.depth >= input.runtime.limits.maxExpandDepth)
    fail('capacity_exceeded');
  const allowed = await readableJoinLocations(state, {
    data: input.data,
    policyData: input.policyData ?? input.data,
    documentId: input.documentId,
  });
  if (!allowed.some((entry) => entry.field.id === input.field.id)) return undefined;
  const query = joinQueryFor(state, input.sourcePath);
  if (query === false) return undefined;
  const result = await virtualJoin(state, {
    runtime: input.runtime,
    field: input.field,
    id: input.documentId,
    ...(query ? { query } : {}),
    identitiesOnly: input.path === '',
  });
  if (input.path === '') return virtualJoinPage(result);
  const values: JsonValue[] = [];
  for (const row of result.rows) {
    const value = await resolvePath(row.state, {
      ...input,
      data: row.data,
      documentId: row.id,
      policyData: row.state.readPolicyData?.get(row.data) ?? row.data,
      depth: input.depth + 1,
    });
    if (value !== undefined) values.push(value);
  }
  return values;
}

function virtualJoinPage(result: Awaited<ReturnType<typeof virtualJoin>>): JsonValue {
  return {
    rows: result.rows.map((row) => ({ collection: row.state.collection.key, id: row.id })),
    page: result.page.page,
    pageSize: result.page.pageSize,
    hasNextPage: result.page.hasNextPage,
    sort: result.sort.map(({ field, order }) => ({ field, order })),
    ...(result.page.total === undefined ? {} : { total: result.page.total }),
    ...(result.orderVersion ? { orderVersion: result.orderVersion } : {}),
  };
}

async function resolvePath(
  state: ContentState,
  input: Input & { path: string; depth: number },
): Promise<JsonValue | undefined> {
  const paths = fieldPaths(state.collection.fields);
  const direct = paths.find((entry) => entry.path === input.path);
  if (direct?.field.type === 'join')
    return joined(state, { ...input, field: direct.field, sourcePath: direct.path, path: '' });
  if (direct) return virtualPath(input.data, input.path.split('.'));
  for (const entry of paths.toSorted((a, b) => b.path.length - a.path.length)) {
    if (!input.path.startsWith(`${entry.path}.`)) continue;
    if (entry.field.type === 'join')
      return joined(state, {
        ...input,
        field: entry.field,
        sourcePath: entry.path,
        path: input.path.slice(entry.path.length + 1),
      });
    if (!['relationship', 'upload'].includes(entry.field.type)) continue;
    const value = virtualPath(input.data, entry.path.split('.'));
    return value === undefined
      ? undefined
      : relationship(state, { ...input, value, path: input.path.slice(entry.path.length + 1) });
  }
  return undefined;
}

async function populate(
  state: ContentState,
  input: Input & { fields: readonly FieldDefinition[]; source: DocumentData },
): Promise<DocumentData> {
  let data = structuredClone(input.data);
  for (const field of dataFields(input.fields)) {
    const name = String(field.name);
    if (typeof field.virtual === 'string') {
      const value = await resolvePath(state, {
        ...input,
        data: input.source,
        path: field.virtual,
        depth: 0,
      });
      if (value === undefined)
        data = Object.fromEntries(Object.entries(data).filter(([key]) => key !== name));
      else data[name] = value;
    }
    const value = data[name];
    if (field.type === 'group' && objectValue(value))
      data[name] = await populate(state, { ...input, fields: field.fields ?? [], data: value });
    if ((field.type === 'array' || field.type === 'blocks') && Array.isArray(value))
      data[name] = await populateRows(state, { ...input, field, values: value });
  }
  return data;
}

async function populateRows(
  state: ContentState,
  input: Input & { field: FieldDefinition; values: JsonValue[]; source: DocumentData },
): Promise<JsonValue[]> {
  const rows: JsonValue[] = [];
  for (const value of input.values) {
    if (!objectValue(value)) {
      rows.push(value);
      continue;
    }
    const fields =
      input.field.type === 'blocks'
        ? (input.field.blocks?.find((block) => block.key === value['blockType'])?.fields ?? [])
        : (input.field.fields ?? []);
    rows.push(await populate(state, { ...input, fields, data: value }));
  }
  return rows;
}

export async function materializeVirtualData(
  state: ContentState,
  input: Input,
): Promise<DocumentData> {
  const fields = fieldPaths(state.collection.fields).filter(
    ({ field }) => typeof field.virtual === 'string',
  );
  if (fields.length === 0) return input.data;
  const source = await projectData({
    ...policyScope(state),
    collection: state.collection,
    data: input.data,
    context: {
      ...policyContext(state, input.data),
      ...(input.documentId ? { documentId: input.documentId } : {}),
    },
  });
  return populate(state, {
    ...input,
    fields: state.collection.fields,
    source,
    policyData: input.data,
  });
}
