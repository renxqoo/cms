import { isDeepStrictEqual } from 'node:util';
import { fail } from '@new-cms/cms/platform/contracts';
import { ownValue, objectValue } from './json-value.ts';
import { valueAtPath } from '../documents/data-path.ts';
import { dataFields } from './structure.ts';
import {
  evaluateFieldPolicy,
  nestedPolicy,
  rowPolicy,
  childDefinitions,
} from './policy-context.ts';
import type { PolicyInput, PolicyTraversal } from './policy-context.ts';
import type { DocumentData, FieldDefinition, JsonValue } from '../definition.ts';

interface WriteTraversal extends PolicyTraversal {
  access: 'write' | 'validate';
  next?: DocumentData;
}
type WriteInput = PolicyInput & { previous?: DocumentData; next?: DocumentData };
function fieldRule(field: FieldDefinition, input: WriteTraversal) {
  return input.access === 'validate'
    ? (field.access?.validate ?? field.access?.write)
    : field.access?.write;
}
async function assertFields(
  fields: readonly FieldDefinition[],
  data: DocumentData,
  input: WriteTraversal,
): Promise<void> {
  for (const field of dataFields(fields)) {
    const value = ownValue(data, String(field.name));
    if (value === undefined) continue;
    if (field.type === 'join' || field.virtual) fail('forbidden');
    const child = nestedPolicy(input, String(field.name));
    const allowed = await evaluateFieldPolicy(fieldRule(field, input), child);
    if (
      !allowed &&
      !(
        input.access === 'validate' &&
        input.context.previousData &&
        isDeepStrictEqual(value, valueAtPath(input.context.previousData, child.path))
      )
    )
      fail('forbidden');
    await assertChildFields(field, value, { ...input, ...child });
  }
}
async function assertChildFields(
  field: FieldDefinition,
  value: JsonValue,
  input: WriteTraversal,
): Promise<void> {
  if (field.type === 'group' && objectValue(value))
    await assertFields(field.fields ?? [], value, input);
  if (!['array', 'blocks'].includes(field.type) || !Array.isArray(value)) return;
  for (const [index, item] of value.entries()) {
    if (!objectValue(item)) continue;
    await assertFields(childDefinitions(field, item), item, {
      ...input,
      ...rowPolicy(input, item, index),
    });
  }
}
async function assertData(input: WriteInput, access: WriteTraversal['access']): Promise<void> {
  const context = {
    ...input.context,
    data: input.context.data ?? input.next ?? input.previous ?? input.data,
    ...(input.previous ? { previousData: input.previous } : {}),
    ...(input.next ? { nextData: input.next } : {}),
  };
  const traversal: WriteTraversal = {
    limits: input.limits,
    functions: input.functions,
    context,
    access,
    path: '',
  };
  await assertFields(input.collection.fields, input.data, traversal);
  if (input.previous)
    await assertProtectedChanges(input.collection.fields, input.previous, {
      ...traversal,
      next: input.next ?? input.data,
    });
}
export function assertWritableData(input: WriteInput): Promise<void> {
  return assertData(input, 'write');
}
export function assertValidationData(input: WriteInput): Promise<void> {
  return assertData(input, 'validate');
}
async function assertProtectedChanges(
  fields: readonly FieldDefinition[],
  previous: DocumentData,
  input: WriteTraversal,
): Promise<void> {
  for (const field of dataFields(fields)) {
    const name = String(field.name);
    const before = ownValue(previous, name);
    if (before === undefined) continue;
    const after = input.next ? ownValue(input.next, name) : undefined;
    const child = { ...input, ...nestedPolicy(input, name) };
    if (
      !(await evaluateFieldPolicy(fieldRule(field, input), child)) &&
      !isDeepStrictEqual(before, after)
    )
      fail('forbidden');
    await protectedChildren(field, before, { ...child, value: after });
  }
}
async function protectedChildren(
  field: FieldDefinition,
  previous: JsonValue,
  input: WriteTraversal & { value: JsonValue | undefined },
): Promise<void> {
  if (field.type === 'group' && objectValue(previous)) {
    const { next: _next, ...base } = input;
    await assertProtectedChanges(field.fields ?? [], previous, {
      ...base,
      ...(objectValue(input.value) ? { next: input.value } : {}),
    });
    return;
  }
  if (!['array', 'blocks'].includes(field.type) || !Array.isArray(previous)) return;
  await protectedRows(field, previous, input);
}
async function protectedRows(
  field: FieldDefinition,
  previous: JsonValue[],
  input: WriteTraversal & { value: JsonValue | undefined },
): Promise<void> {
  const next = Array.isArray(input.value) ? input.value : [];
  for (const [index, item] of previous.entries()) {
    if (!objectValue(item)) continue;
    const match = next.find(
      (candidate) => objectValue(candidate) && candidate['id'] === item['id'],
    );
    const unchanged =
      objectValue(match) && (field.type !== 'blocks' || match['blockType'] === item['blockType']);
    const { next: _next, ...base } = input;
    await assertProtectedChanges(childDefinitions(field, item), item, {
      ...base,
      ...rowPolicy(input, item, index),
      ...(unchanged ? { next: match } : {}),
    });
  }
}
