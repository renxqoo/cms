import { ownValue } from './json-value.ts';
import { isDeepStrictEqual } from 'node:util';
import { ruleResult } from './rule-result.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type {
  CollectionDefinition,
  DocumentData,
  FieldDefinition,
  FieldPolicyContext,
  JsonValue,
} from '../definition.ts';
import { children, dataFields, fieldPaths, assertSelect } from './structure.ts';
import { objectValue, isJsonValue } from './json-value.ts';
import { generateCollectionSchema } from './data-schema.ts';

interface PolicyInput {
  collection: CollectionDefinition;
  data: DocumentData;
  context: FieldPolicyContext;
  select?: readonly string[];
}
function selected(path: string, select: readonly string[] | undefined): boolean {
  return (
    !select ||
    select.some(
      (item) => item === path || item.startsWith(`${path}.`) || path.startsWith(`${item}.`),
    )
  );
}
function projectValue(
  field: FieldDefinition,
  value: JsonValue,
  input: { context: FieldPolicyContext; path: string; select?: readonly string[] },
): JsonValue {
  if (value === null) return null;
  if (field.type === 'group' && objectValue(value))
    return projectFields(field.fields ?? [], value, input);
  if ((field.type === 'array' || field.type === 'blocks') && Array.isArray(value)) {
    return value.map((item) => {
      if (!objectValue(item)) return item;
      const fields =
        field.type === 'blocks'
          ? (field.blocks?.find((block) => block.key === item['blockType'])?.fields ?? [])
          : (field.fields ?? []);
      const result = projectFields(fields, item, input);
      if (item['id'] !== undefined) result['id'] = item['id'];
      if (item['blockType'] !== undefined) result['blockType'] = item['blockType'];
      return result;
    });
  }
  return structuredClone(value);
}
function projectFields(
  fields: readonly FieldDefinition[],
  data: DocumentData,
  input: { context: FieldPolicyContext; path: string; select?: readonly string[] },
): DocumentData {
  const result: DocumentData = {};
  for (const field of dataFields(fields)) {
    const name = String(field.name);
    const path = input.path ? `${input.path}.${name}` : name;
    const value = ownValue(data, name);
    if (
      value === undefined ||
      !selected(path, input.select) ||
      (field.access?.read && !ruleResult(field.access.read.run(input.context)))
    )
      continue;
    result[name] = projectValue(field, value, { ...input, path });
  }
  return result;
}
export function projectData(input: PolicyInput): DocumentData {
  assertSelect(input.collection, input.select);
  return projectFields(input.collection.fields, input.data, {
    context: { ...input.context, data: input.data },
    path: '',
    ...(input.select ? { select: input.select } : {}),
  });
}
function assertFields(
  fields: readonly FieldDefinition[],
  data: DocumentData,
  context: FieldPolicyContext,
): void {
  for (const field of dataFields(fields)) {
    const value = ownValue(data, String(field.name));
    if (value === undefined) continue;
    if (field.type === 'join') fail('forbidden');
    if (field.access?.write && !ruleResult(field.access.write.run(context))) fail('forbidden');
    assertChildFields(field, value, context);
  }
}
function assertChildFields(
  field: FieldDefinition,
  value: JsonValue,
  context: FieldPolicyContext,
): void {
  if (field.type === 'group' && objectValue(value))
    assertFields(field.fields ?? [], value, context);
  if (!['array', 'blocks'].includes(field.type) || !Array.isArray(value)) return;
  for (const item of value) {
    if (!objectValue(item)) continue;
    const childFields =
      field.type === 'blocks'
        ? (field.blocks?.find((block) => block.key === item['blockType'])?.fields ?? [])
        : (field.fields ?? []);
    assertFields(childFields, item, context);
  }
}

export function assertWritableData(
  input: PolicyInput & { previous?: DocumentData; next?: DocumentData },
): void {
  const context = {
    ...input.context,
    data: input.context.data ?? input.next ?? input.previous ?? input.data,
    ...(input.previous ? { previousData: input.previous } : {}),
    ...(input.next ? { nextData: input.next } : {}),
  };
  assertFields(input.collection.fields, input.data, context);
  if (input.previous)
    assertProtectedChanges(input.collection.fields, input.previous, {
      context,
      next: input.next ?? input.data,
    });
}
function assertProtectedChanges(
  fields: readonly FieldDefinition[],
  previous: DocumentData,
  input: { context: FieldPolicyContext; next?: DocumentData },
): void {
  for (const field of dataFields(fields)) {
    const before = ownValue(previous, String(field.name));
    if (before === undefined) continue;
    const after = input.next ? ownValue(input.next, String(field.name)) : undefined;
    if (
      field.access?.write &&
      !ruleResult(field.access.write.run(input.context)) &&
      !isDeepStrictEqual(before, after)
    )
      fail('forbidden');
    protectedChildren(field, before, { ...input, value: after });
  }
}
function protectedChildren(
  field: FieldDefinition,
  previous: JsonValue,
  input: { context: FieldPolicyContext; value: JsonValue | undefined },
): void {
  if (field.type === 'group' && objectValue(previous)) {
    assertProtectedChanges(field.fields ?? [], previous, {
      context: input.context,
      ...(objectValue(input.value) ? { next: input.value } : {}),
    });
    return;
  }
  if (!['array', 'blocks'].includes(field.type) || !Array.isArray(previous)) return;
  protectedRows(field, previous, input);
}
function protectedRows(
  field: FieldDefinition,
  previous: JsonValue[],
  input: { context: FieldPolicyContext; value: JsonValue | undefined },
): void {
  const next = Array.isArray(input.value) ? input.value : [];
  for (const item of previous) {
    if (!objectValue(item)) continue;
    const match = next.find(
      (candidate) => objectValue(candidate) && candidate['id'] === item['id'],
    );
    const unchanged =
      objectValue(match) && (field.type !== 'blocks' || match['blockType'] === item['blockType']);
    const childFields =
      field.type === 'blocks'
        ? (field.blocks?.find((block) => block.key === item['blockType'])?.fields ?? [])
        : (field.fields ?? []);
    assertProtectedChanges(childFields, item, {
      context: input.context,
      ...(unchanged ? { next: match } : {}),
    });
  }
}

function canQuery(field: FieldDefinition, context: FieldPolicyContext): boolean {
  if (field.type === 'join') return false;
  if (field.access?.query) return ruleResult(field.access.query.run(context));
  return !field.access?.read;
}
export function queryableFields(input: {
  collection: CollectionDefinition;
  context: FieldPolicyContext;
}): string[] {
  const allowed = new Map<string, boolean>();
  function visit(fields: readonly FieldDefinition[], prefix: string, parentAllowed: boolean): void {
    for (const field of dataFields(fields)) {
      const path = prefix ? `${prefix}.${field.name}` : String(field.name);
      const canQueryPath = parentAllowed && canQuery(field, input.context);
      allowed.set(path, (allowed.get(path) ?? true) && canQueryPath);
      visit(children(field), path, canQueryPath);
    }
  }
  visit(input.collection.fields, '', true);
  return [...allowed].flatMap(([path, permitted]) => (permitted ? [path] : []));
}
function safeMetadataFields(
  fields: readonly FieldDefinition[],
  context: FieldPolicyContext,
): FieldDefinition[] {
  return dataFields(fields)
    .filter(
      (field) =>
        !field.access?.read ||
        ((field.access.query ? ruleResult(field.access.query.run(context)) : false) &&
          ruleResult(field.access.read.run(context))),
    )
    .map((field) => ({
      ...field,
      ...(field.fields ? { fields: safeMetadataFields(field.fields, context) } : {}),
      ...(field.blocks
        ? {
            blocks: field.blocks.map((block) => ({
              ...block,
              fields: safeMetadataFields(block.fields, context),
            })),
          }
        : {}),
    }));
}
export function collectionMetadata(input: {
  collection: CollectionDefinition;
  context: FieldPolicyContext;
}) {
  const fields = safeMetadataFields(input.collection.fields, input.context);
  const visible = fieldPaths(fields);
  const queryable = new Set(queryableFields(input));
  const dataSchema = generateCollectionSchema({ ...input.collection, fields }, 'read');
  if (!isJsonValue(dataSchema)) fail('invalid_input');
  return {
    key: input.collection.key,
    label: input.collection.label,
    schemaVersion: input.collection.schemaVersion,
    mode: input.collection.mode,
    history: input.collection.history !== false,
    singleton: input.collection.singleton === true,
    locales: [...input.collection.locales.supported],
    dataSchema,
    fields: visible.map(({ path, field }) => ({
      id: field.id,
      path,
      type: field.type,
      label: field.label ?? field.name ?? '',
      required: field.required === true,
      localized: field.localized === true,
      queryable: queryable.has(path),
      ...(field.options ? { options: [...field.options] } : {}),
    })),
  };
}
