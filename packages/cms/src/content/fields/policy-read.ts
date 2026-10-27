import { ownValue, objectValue } from './json-value.ts';
import { assertSelect, dataFields } from './structure.ts';
import {
  evaluateFieldPolicy,
  nestedPolicy,
  rowPolicy,
  childDefinitions,
} from './policy-context.ts';
import type { PolicyInput, PolicyScope, PolicyTraversal } from './policy-context.ts';
import type {
  DocumentData,
  FieldDefinition,
  FieldPolicyContext,
  JsonValue,
} from '../definition.ts';

interface ReadTraversal extends PolicyTraversal {
  schemaPath: string;
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
async function projectValue(
  field: FieldDefinition,
  value: JsonValue,
  input: ReadTraversal,
): Promise<JsonValue> {
  if (value === null) return null;
  if (field.type === 'group' && objectValue(value))
    return projectFields(field.fields ?? [], value, input);
  if ((field.type === 'array' || field.type === 'blocks') && Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (const [index, item] of value.entries()) {
      if (!objectValue(item)) {
        result.push(item);
        continue;
      }
      const row = await projectFields(childDefinitions(field, item), item, {
        ...input,
        ...rowPolicy(input, item, index),
      });
      if (item['id'] !== undefined) row['id'] = item['id'];
      if (item['blockType'] !== undefined) row['blockType'] = item['blockType'];
      result.push(row);
    }
    return result;
  }
  return structuredClone(value);
}
async function projectFields(
  fields: readonly FieldDefinition[],
  data: DocumentData,
  input: ReadTraversal,
): Promise<DocumentData> {
  const result: DocumentData = {};
  for (const field of dataFields(fields)) {
    const name = String(field.name);
    const schemaPath = input.schemaPath ? `${input.schemaPath}.${name}` : name;
    const value = ownValue(data, name);
    const child = { ...input, ...nestedPolicy(input, name), schemaPath };
    if (
      value === undefined ||
      !selected(schemaPath, input.select) ||
      !(await evaluateFieldPolicy(field.access?.read, child))
    )
      continue;
    result[name] = await projectValue(field, value, child);
  }
  return result;
}
export function projectData(input: PolicyInput): Promise<DocumentData> {
  assertSelect(input.collection, input.select);
  return projectFields(input.collection.fields, input.data, {
    context: { ...input.context, data: input.policyData ?? input.data },
    limits: input.limits,
    functions: input.functions,
    path: '',
    schemaPath: '',
    ...(input.select ? { select: input.select } : {}),
  });
}
export function isFieldReadable(
  field: FieldDefinition,
  context: FieldPolicyContext,
  scope: PolicyScope,
): Promise<boolean> {
  return evaluateFieldPolicy(field.access?.read, {
    ...scope,
    context,
    path: context.path ?? field.name ?? '',
  });
}
