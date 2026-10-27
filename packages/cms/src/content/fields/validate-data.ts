import { fail } from '@new-cms/cms/platform/contracts';
import { dataFields } from './structure.ts';
import { assertJsonBudget } from './data-budget.ts';
import { objectValue, ownValue } from './json-value.ts';
import { immutable, invokeFunction } from './invoke-function.ts';
import { fillDefaults } from './value-defaults.ts';
import { validateDataShape } from './validate-shape.ts';
import { disabledFieldRules } from './conditional-rules.ts';
import { assertFilteredChoices } from './filtered-choices.ts';
import { rethrowFieldError } from './validation-error.ts';
import type { FunctionScope } from './invoke-function.ts';
import type {
  CollectionDefinition,
  ContentLimits,
  DocumentData,
  FieldDefinition,
  FieldValueContext,
  JsonValue,
} from '../definition.ts';

interface Input {
  collection: CollectionDefinition;
  data: unknown;
  mode: 'draft' | 'publish';
  locale: string;
  limits: ContentLimits;
  applyDefaults?: boolean;
  requireComplete?: boolean;
  allowVirtual?: boolean;
  functions?: FunctionScope;
}

interface State {
  path: string;
  disabledRules: ReadonlySet<string>;
  input: Input;
  root: DocumentData;
  scope: FunctionScope;
}

async function validateValue(
  state: State,
  field: FieldDefinition,
  value: JsonValue,
): Promise<void> {
  if (value === null) return;
  await assertFilteredChoices({
    field,
    path: state.path,
    data: state.root,
    locale: state.input.locale,
    collection: state.input.collection.key,
    mode: state.input.mode === 'publish' ? 'published' : 'editing',
    limits: state.input.limits,
    functions: state.scope,
    value,
  });
  if (field.validate && !state.disabledRules.has(state.path)) {
    const context: FieldValueContext = immutable({
      data: state.root,
      locale: state.input.locale,
      mode: state.input.mode,
      ...(state.scope.actor ? { actor: state.scope.actor } : {}),
      ...(state.scope.operation ? { operation: state.scope.operation } : {}),
    });
    const accepted = await invokeFunction({
      scope: state.scope,
      limits: state.input.limits,
      run: (signal) => field.validate?.run(immutable(value), Object.freeze({ ...context, signal })),
    });
    if (accepted !== true) fail('invalid_input');
  }
  if (field.type === 'group' && objectValue(value))
    await validateFields(state, field.fields ?? [], value);
  await validateChildren(state, field, value);
}

async function validateChildren(
  state: State,
  field: FieldDefinition,
  value: JsonValue,
): Promise<void> {
  if ((field.type === 'array' || field.type === 'blocks') && Array.isArray(value)) {
    for (const row of value) {
      if (!objectValue(row)) continue;
      const fields =
        field.type === 'blocks'
          ? (field.blocks?.find((block) => block.key === row['blockType'])?.fields ?? [])
          : (field.fields ?? []);
      await validateFields(
        { ...state, path: `${state.path}.${typeof row['id'] === 'string' ? row['id'] : ''}` },
        fields,
        row,
      );
    }
  }
}

async function validateFields(
  state: State,
  fields: readonly FieldDefinition[],
  data: DocumentData,
): Promise<void> {
  for (const field of dataFields(fields)) {
    const value = ownValue(data, String(field.name));
    if (
      value !== undefined &&
      field.type !== 'join' &&
      (state.input.allowVirtual || !field.virtual)
    )
      try {
        await validateValue(
          { ...state, path: [state.path, field.name].filter(Boolean).join('.') },
          field,
          value,
        );
      } catch (error) {
        rethrowFieldError(error, [state.path, field.name].filter(Boolean).join('.'));
      }
  }
}

export async function validateData(input: Input): Promise<DocumentData> {
  assertJsonBudget(input.data, {
    maxDepth: input.limits.maxFieldDepth * 2 + input.limits.maxRichTextDepth * 2 + 1,
    maxBytes: input.limits.maxDataBytes,
    maxNodes: input.limits.maxDataBytes,
  });
  const scope = input.functions ?? { budget: { used: 0 } };
  let source = input.data;
  if (input.applyDefaults && objectValue(source))
    source = await fillDefaults({
      fields: input.collection.fields,
      data: source,
      locale: input.locale,
      limits: input.limits,
      scope,
    });
  const shaped = validateDataShape({ ...input, mode: 'draft', data: source, applyDefaults: false });
  const disabledRules = await disabledFieldRules({
    collection: input.collection,
    data: shaped,
    locale: input.locale,
    mode: input.mode,
    limits: input.limits,
    functions: scope,
  });
  const data = validateDataShape({
    ...input,
    mode: input.requireComplete ? 'publish' : input.mode,
    data: shaped,
    applyDefaults: false,
    disabledRules,
  });
  await validateFields(
    { input, root: data, scope, path: '', disabledRules },
    input.collection.fields,
    data,
  );
  return data;
}

export async function validateLocaleValues(input: {
  collection: CollectionDefinition;
  data: Readonly<Record<string, DocumentData>>;
  limits: ContentLimits;
  functions: FunctionScope;
  validateRules: boolean;
}): Promise<Record<string, DocumentData>> {
  const values: Record<string, DocumentData> = {};
  for (const [locale, data] of Object.entries(input.data)) {
    const local = {
      collection: input.collection,
      data,
      locale,
      mode: 'draft' as const,
      limits: input.limits,
      functions: input.functions,
    };
    values[locale] = input.validateRules
      ? await validateData(local)
      : validateDataShape({ ...local, applyDefaults: false });
  }
  return values;
}
