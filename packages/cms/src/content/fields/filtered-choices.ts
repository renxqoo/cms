import { fail } from '@new-cms/cms/platform/contracts';
import { immutable, invokeFunction } from './invoke-function.ts';
import { candidateSibling } from './sibling-data.ts';
import { fieldOptionSchema, optionValues } from './options.ts';
import type { FunctionScope } from './invoke-function.ts';
import type {
  ContentLimits,
  DocumentData,
  FieldDefinition,
  FieldOption,
  FilterOptionsContext,
} from '../definition.ts';

interface ChoiceInput {
  field: FieldDefinition;
  path: string;
  data: DocumentData;
  locale: string;
  collection: string;
  mode: 'editing' | 'published';
  limits: ContentLimits;
  functions: FunctionScope;
  documentId?: string;
}

export async function filteredChoices(input: ChoiceInput): Promise<FieldOption[] | undefined> {
  const { field } = input;
  if (!['select', 'radio', 'blocks'].includes(field.type) || field.filterOptions === undefined)
    return undefined;
  const available: FieldOption[] =
    field.type === 'blocks'
      ? (field.blocks ?? []).map((block) => block.key)
      : [...(field.options ?? [])];
  const value = await resolveOptions(input, available);
  return checkedOptions(input.field, available, value);
}

async function resolveOptions(input: ChoiceInput, available: FieldOption[]): Promise<unknown> {
  const { field, functions } = input;
  const filter = field.filterOptions;
  let value: unknown = filter;
  if (typeof filter === 'object' && !Array.isArray(filter) && 'run' in filter) {
    if (!functions.actor) return available;
    const sibling = candidateSibling(input.data, input.path);
    const context: FilterOptionsContext = immutable({
      actor: functions.actor,
      operation: functions.operation ?? '',
      collectionKey: input.collection,
      mode: input.mode,
      locale: input.locale,
      data: input.data,
      siblingData: sibling.siblingData,
      ...(sibling.blockData ? { blockData: sibling.blockData } : {}),
      ...(input.documentId ? { documentId: input.documentId } : {}),
      path: input.path,
      options: available,
      blockKeys: (field.blocks ?? []).map((block) => block.key),
    });
    value = await invokeFunction({
      limits: input.limits,
      scope: functions,
      run: (signal) => filter.run(Object.freeze({ ...context, signal })),
    });
  }
  return value;
}

function checkedOptions(
  field: FieldDefinition,
  available: FieldOption[],
  value: unknown,
): FieldOption[] {
  if (value === true) return available;
  if (value === false) return [];
  if (!Array.isArray(value) || value.length > available.length) fail('invalid_input');
  const allowed = new Map(
    available.map((option) => [typeof option === 'string' ? option : option.value, option]),
  );
  const result: FieldOption[] = [];
  const seen = new Set<string>();
  for (const option of value) {
    const parsed = fieldOptionSchema.safeParse(option);
    if (!parsed.success || (field.type === 'blocks' && typeof parsed.data !== 'string'))
      fail('invalid_input');
    const key = typeof parsed.data === 'string' ? parsed.data : parsed.data.value;
    if (!allowed.has(key) || seen.has(key)) fail('invalid_input');
    seen.add(key);
    result.push(parsed.data);
  }
  return result;
}

export async function assertFilteredChoices(
  input: Parameters<typeof filteredChoices>[0] & { value: unknown },
): Promise<void> {
  const options = await filteredChoices(input);
  if (!options) return;
  const allowed = new Set(optionValues({ options }));
  const values: unknown[] = Array.isArray(input.value) ? input.value : [input.value];
  if (
    values.some((value) => {
      if (value === null || value === undefined) return false;
      const key =
        input.field.type === 'blocks' && typeof value === 'object' && 'blockType' in value
          ? value.blockType
          : value;
      return typeof key !== 'string' || !allowed.has(key);
    })
  )
    fail('invalid_input', {
      fieldErrors: [{ field: input.path, message: 'Selected option is not allowed.' }],
    });
}
