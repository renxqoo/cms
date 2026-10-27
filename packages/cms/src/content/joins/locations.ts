import { dataFields, fieldPaths } from '../fields/structure.ts';
import { objectValue, ownValue } from '../fields/json-value.ts';
import { isFieldReadable } from '../fields/policy-read.ts';
import { policyContext } from '../runtime.ts';
import { policyScope } from '../hooks/invoke.ts';
import type { DocumentData, FieldDefinition } from '../definition.ts';
import type { ContentState } from '../types.ts';

export interface JoinLocation {
  field: FieldDefinition;
  path: string;
  schemaPath: string;
}
interface Walk {
  state: ContentState;
  policyData: DocumentData;
  documentId: string;
  data: DocumentData;
  fields: readonly FieldDefinition[];
  prefix: string;
  paths: ReadonlyMap<string, string>;
  result: JoinLocation[];
  branches: ReadonlySet<string>;
}

function joinBranches(fields: readonly FieldDefinition[]): Set<string> {
  const result = new Set<string>();
  for (const field of dataFields(fields)) {
    const descendants = joinBranches([
      ...(field.fields ?? []),
      ...(field.blocks ?? []).flatMap((block) => block.fields),
    ]);
    if (field.type === 'join' || descendants.size > 0) result.add(field.id);
    for (const id of descendants) result.add(id);
  }
  return result;
}

async function collect(input: Walk): Promise<void> {
  for (const field of dataFields(input.fields)) {
    if (!input.branches.has(field.id)) continue;
    const path = input.prefix ? `${input.prefix}.${field.name}` : String(field.name);
    if (
      !(await isFieldReadable(
        field,
        { ...policyContext(input.state, input.policyData), documentId: input.documentId, path },
        policyScope(input.state),
      ))
    )
      continue;
    if (field.type === 'join') {
      input.result.push({ field, path, schemaPath: input.paths.get(field.id) ?? path });
      continue;
    }
    const value = ownValue(input.data, String(field.name));
    if (field.type === 'group')
      await collect({
        ...input,
        fields: field.fields ?? [],
        data: objectValue(value) ? value : {},
        prefix: path,
      });
    if ((field.type === 'array' || field.type === 'blocks') && Array.isArray(value))
      await rows(input, { field, path, values: value });
  }
}

async function rows(
  input: Walk,
  group: { field: FieldDefinition; path: string; values: readonly unknown[] },
) {
  for (const [index, value] of group.values.entries()) {
    if (!objectValue(value)) continue;
    const fields =
      group.field.type === 'blocks'
        ? (group.field.blocks?.find((block) => block.key === value['blockType'])?.fields ?? [])
        : (group.field.fields ?? []);
    await collect({
      ...input,
      fields,
      data: value,
      prefix: `${group.path}.${typeof value['id'] === 'string' ? value['id'] : index}`,
    });
  }
}

export async function readableJoinLocations(
  state: ContentState,
  input: { data: DocumentData; policyData: DocumentData; documentId: string },
): Promise<JoinLocation[]> {
  const result: JoinLocation[] = [];
  await collect({
    ...input,
    state,
    fields: state.collection.fields,
    prefix: '',
    paths: new Map(fieldPaths(state.collection.fields).map(({ field, path }) => [field.id, path])),
    result,
    branches: joinBranches(state.collection.fields),
  });
  return result;
}
