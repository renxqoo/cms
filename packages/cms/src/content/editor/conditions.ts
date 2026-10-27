import { fail } from '@new-cms/cms/platform/contracts';
import { allFieldDefinitions } from '../fields/structure.ts';
import { objectValue } from '../fields/json-value.ts';
import { immutable } from '../fields/invoke-function.ts';
import { valueAtPath } from '../documents/data-path.ts';
import { hookContext, invoke } from '../hooks/invoke.ts';
import { candidateSibling } from '../fields/sibling-data.ts';
import type { AdminConditionContext, DocumentData, FieldDefinition } from '../definition.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { EditorNode } from './contracts.ts';

interface Input {
  runtime: ContentRuntime;
  layout: readonly EditorNode[];
  data: DocumentData;
}
interface State extends Input {
  definitions: ReadonlyMap<string, FieldDefinition>;
  result: Record<string, boolean>;
  prefix: string;
}

async function visible(
  state: ContentState,
  field: FieldDefinition | undefined,
  input: State & { path: string },
): Promise<boolean> {
  if (!field?.admin?.condition) return true;
  const { siblingData, blockData } = candidateSibling(input.data, input.path);
  const context: AdminConditionContext = Object.freeze({
    ...hookContext(state, { data: input.data, path: input.path }),
    data: immutable(input.data),
    siblingData: immutable(siblingData),
    ...(blockData ? { blockData: immutable(blockData) } : {}),
  });
  const result = await invoke(state, {
    hook: field.admin.condition,
    context,
    limits: input.runtime.limits,
  });
  if (typeof result !== 'boolean') fail('invalid_input');
  return result;
}

async function nested(
  state: ContentState,
  node: EditorNode,
  input: State & { path: string },
): Promise<void> {
  if (['array', 'blocks'].includes(node.type)) {
    const value = valueAtPath(input.data, input.path);
    if (!Array.isArray(value)) return;
    for (const row of value) {
      if (!objectValue(row) || typeof row['id'] !== 'string') continue;
      const layout =
        node.type === 'blocks'
          ? (node.blocks?.find((block) => block.key === row['blockType'])?.children ?? [])
          : (node.children ?? []);
      await walk(state, { ...input, layout, prefix: `${input.path}.${row['id']}` });
    }
    return;
  }
  await walk(state, { ...input, layout: node.children ?? [], prefix: input.path });
  for (const tab of node.tabs ?? [])
    await walk(state, {
      ...input,
      layout: tab.children,
      prefix: tab.name ? [input.path, tab.name].filter(Boolean).join('.') : input.path,
    });
}

async function walk(state: ContentState, input: State): Promise<void> {
  for (const node of input.layout) {
    const path = node.name ? [input.prefix, node.name].filter(Boolean).join('.') : input.prefix;
    const allowed = await visible(state, input.definitions.get(node.id), { ...input, path });
    if (node.condition) input.result[`${path}#${node.id}`] = allowed;
    if (allowed) await nested(state, node, { ...input, path });
  }
}

export async function editorVisibility(
  state: ContentState,
  input: Input,
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  const definitions = new Map(
    allFieldDefinitions(state.collection.fields).map((field) => [field.id, field]),
  );
  await walk(state, { ...input, definitions, result, prefix: '' });
  return result;
}
