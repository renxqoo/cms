import { resolveLabel } from '../collections/labels.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { dataFieldInstances } from '../fields/structure.ts';
import { immutable, invokeFunction } from '../fields/invoke-function.ts';
import { candidateSibling } from '../fields/sibling-data.ts';
import { functionScope, hookContext } from '../hooks/invoke.ts';
import { replaceAtPath, valueAtPath } from './data-path.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData, FieldDefinition } from '../definition.ts';
import type { LocaleData } from './prepare-write.ts';

export function defaultSlug(value: unknown): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim().toLowerCase(), (character) => {
    if (character === ' ') return '-';
    return /^[a-z0-9_-]$/.test(character) ? character : '';
  }).join('');
}

async function slugify(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    field: FieldDefinition;
    path: string;
    data: DocumentData;
    value: unknown;
    documentId?: string;
  },
): Promise<string> {
  if (!input.field.slugify) return defaultSlug(input.value);
  const sibling = candidateSibling(input.data, input.path);
  const { signal: _signal, ...base } = hookContext(state, {
    data: input.data,
    path: input.path,
    ...(input.documentId ? { documentId: input.documentId } : {}),
  });
  const context = immutable({
    ...base,
    data: input.data,
    siblingData: sibling.siblingData,
    ...(sibling.blockData ? { blockData: sibling.blockData } : {}),
    valueToSlugify: typeof input.value === 'string' ? input.value : '',
  });
  const result = await invokeFunction({
    limits: input.runtime.limits,
    scope: functionScope(state),
    run: (signal) => input.field.slugify?.run(Object.freeze({ ...context, signal })),
  });
  if (typeof result !== 'string') fail('invalid_input');
  return result;
}

async function available(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    data: DocumentData;
    path: string;
    value: string;
    field: FieldDefinition;
    documentId?: string;
  },
): Promise<boolean> {
  const data = structuredClone(input.data);
  replaceAtPath(data, input.path, input.value);
  const conflicts = await input.runtime.store.conflictingUniqueFields(state.tx, {
    collection: state.collection.key,
    dataByLocale: { [state.locale]: data },
    ...(input.documentId ? { id: input.documentId } : {}),
  });
  const logicalPath = input.runtime.mapping
    .get(state.collection.key)
    .flat.find((mapping) => mapping.field.id === input.field.id)?.path;
  return !conflicts.some((conflict) => conflict.fields.includes(logicalPath ?? input.path));
}

async function fieldSlug(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    field: FieldDefinition;
    path: string;
    data: DocumentData;
    previous: DocumentData;
    documentId?: string;
  },
): Promise<string> {
  const incoming = valueAtPath(input.data, input.path);
  const stored = valueAtPath(input.previous, input.path);
  const explicit = await slugify(state, { ...input, value: incoming });
  if (explicit) {
    if (
      explicit === stored ||
      input.field.unique === false ||
      (await available(state, { ...input, value: explicit }))
    )
      return explicit;
    fail('invalid_input', {
      fieldErrors: [{ field: input.path, message: 'Value must be unique.' }],
    });
  }
  if (typeof stored === 'string' && stored) return stored;
  const sibling = candidateSibling(input.data, input.path).siblingData;
  const source =
    state.operationId === 'documents.copy' ? undefined : sibling[input.field.useAsSlug ?? 'title'];
  const derived = await slugify(state, { ...input, value: source });
  return generatedSlug(state, input, derived);
}

async function generatedSlug(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    field: FieldDefinition;
    path: string;
    data: DocumentData;
    previous: DocumentData;
    documentId?: string;
  },
  derived: string,
): Promise<string> {
  const fallback = await slugify(state, {
    ...input,
    value: resolveLabel(state.collection.labels?.singular, state.locale, state.collection.label),
  });
  let suffix = derived ? 0 : 1;
  for (;;) {
    const value =
      derived && suffix === 0
        ? derived
        : `${derived || fallback || state.collection.key}-${suffix}`;
    if (input.field.unique === false || (await available(state, { ...input, value }))) return value;
    suffix += 1;
  }
}

export async function prepareNativeSlugs(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    dataByLocale: LocaleData;
    previous: LocaleData;
    requested: readonly string[];
    documentId?: string;
  },
): Promise<LocaleData> {
  const result = structuredClone(input.dataByLocale);
  const shared = new Map<string, string>();
  const order = [...new Set([...input.requested, ...Object.keys(result)])];
  for (const locale of order) {
    const data = result[locale];
    if (!data) continue;
    for (const { field, path } of dataFieldInstances({ fields: state.collection.fields, data })) {
      if (field.type !== 'slug') continue;
      const localized = input.runtime.mapping
        .get(state.collection.key)
        .flat.find((mapping) => mapping.field.id === field.id)?.localized;
      if (localized && !input.requested.includes(locale)) continue;
      const value =
        shared.get(path) ??
        (await fieldSlug(
          { ...state, locale },
          { ...input, field, path, data, previous: input.previous[locale] ?? {} },
        ));
      replaceAtPath(data, path, value);
      if (!localized) shared.set(path, value);
    }
  }
  return result;
}

export function clearCopiedSlugs(
  fields: readonly FieldDefinition[],
  dataByLocale: LocaleData,
): LocaleData {
  const result = structuredClone(dataByLocale);
  for (const data of Object.values(result))
    for (const { field, path } of dataFieldInstances({ fields, data }))
      if (field.type === 'slug') replaceAtPath(data, path, null);
  return result;
}
