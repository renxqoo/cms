import { fail } from '@new-cms/cms/platform/contracts';
import { immutable, invokeFunction } from './invoke-function.ts';
import { objectValue, ownValue } from './json-value.ts';
import type { FunctionScope } from './invoke-function.ts';
import type {
  AdminConditionContext,
  CollectionDefinition,
  ContentLimits,
  DocumentData,
  FieldDefinition,
} from '../definition.ts';

interface State {
  collection: CollectionDefinition;
  data: DocumentData;
  locale: string;
  mode: 'draft' | 'publish';
  limits: ContentLimits;
  functions: FunctionScope;
  disabled: Set<string>;
}
interface Location {
  prefix: string;
  inherited: boolean;
  blockData?: DocumentData;
}

async function enabled(
  state: State,
  field: FieldDefinition,
  input: Location & { path: string; siblingData: DocumentData },
) {
  if (input.inherited) return false;
  const condition = field.admin?.condition;
  const { actor } = state.functions;
  if (!condition || !actor) return true;
  const context: AdminConditionContext = immutable({
    actor,
    collectionKey: state.collection.key,
    operation: state.functions.operation ?? 'documents.validate',
    locale: state.locale,
    mode: state.mode === 'draft' ? 'editing' : 'published',
    data: state.data,
    siblingData: input.siblingData,
    path: input.path,
    ...(input.blockData ? { blockData: input.blockData } : {}),
  });
  const result = await invokeFunction({
    scope: state.functions,
    limits: state.limits,
    run: (signal) => condition.run(Object.freeze({ ...context, signal })),
  });
  if (typeof result !== 'boolean') fail('invalid_input');
  return result;
}

async function walk(
  state: State,
  input: { fields: readonly FieldDefinition[]; data: DocumentData; location: Location },
): Promise<void> {
  for (const field of input.fields) {
    const path = field.name
      ? [input.location.prefix, field.name].filter(Boolean).join('.')
      : input.location.prefix;
    const active = await enabled(state, field, {
      ...input.location,
      path,
      siblingData: input.data,
    });
    const location = { ...input.location, prefix: path, inherited: !active };
    if (!active && field.name) state.disabled.add(path);
    if (field.type === 'row' || field.type === 'collapsible')
      await walk(state, { fields: field.fields ?? [], data: input.data, location });
    else if (field.type === 'tabs') await tabs(state, { field, data: input.data, location });
    else
      await children(state, {
        field,
        value: field.name ? ownValue(input.data, field.name) : undefined,
        location,
      });
  }
}

async function tabs(
  state: State,
  input: { field: FieldDefinition; data: DocumentData; location: Location },
) {
  for (const tab of input.field.tabs ?? []) {
    const value = tab.name ? ownValue(input.data, tab.name) : input.data;
    await walk(state, {
      fields: tab.fields,
      data: objectValue(value) ? value : {},
      location: {
        ...input.location,
        prefix: tab.name
          ? [input.location.prefix, tab.name].filter(Boolean).join('.')
          : input.location.prefix,
      },
    });
  }
}

async function children(
  state: State,
  input: { field: FieldDefinition; value: unknown; location: Location },
) {
  if (input.field.type === 'group' && objectValue(input.value))
    await walk(state, {
      fields: input.field.fields ?? [],
      data: input.value,
      location: input.location,
    });
  if (!['array', 'blocks'].includes(input.field.type) || !Array.isArray(input.value)) return;
  for (const row of input.value) {
    if (!objectValue(row) || typeof row['id'] !== 'string') continue;
    const fields =
      input.field.type === 'blocks'
        ? (input.field.blocks?.find((block) => block.key === row['blockType'])?.fields ?? [])
        : (input.field.fields ?? []);
    await walk(state, {
      fields,
      data: row,
      location: {
        ...input.location,
        prefix: `${input.location.prefix}.${row['id']}`,
        ...(input.field.type === 'blocks' ? { blockData: row } : {}),
      },
    });
  }
}

export async function disabledFieldRules(
  input: Omit<State, 'disabled'>,
): Promise<ReadonlySet<string>> {
  const disabled = new Set<string>();
  await walk(
    { ...input, disabled },
    {
      fields: input.collection.fields,
      data: input.data,
      location: { prefix: '', inherited: false },
    },
  );
  return disabled;
}
