import { fail } from '@new-cms/cms/platform/contracts';
import { normalizeLocaleData } from '../fields/normalize-locale-data.ts';
import { assertWritableData } from '../fields/policies.ts';
import { policyContext } from '../runtime.ts';
import { referencesForLocale } from './revision-data.ts';
import { snapshotPatch } from './snapshot-patch.ts';
import type { LanguageInput } from './revision-data.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';
import type { DocumentRow } from '../model.ts';

export type LocaleData = Record<string, DocumentData>;

function localeData(values: LocaleData, locale: string): DocumentData {
  return Object.hasOwn(values, locale) ? (values[locale] ?? {}) : {};
}

export async function readLocaleData(
  state: ContentState,
  input: { runtime: ContentRuntime; document?: DocumentRow; versionId?: string },
): Promise<LocaleData> {
  if (!input.document)
    return Object.fromEntries(state.collection.locales.supported.map((locale) => [locale, {}]));
  const documentId = input.document.id;
  const versionId = input.versionId ?? input.document.currentVersionId;
  const data = await input.runtime.store.readRevisionDataBatch(state.tx, {
    collection: state.collection.key,
    items: state.collection.locales.supported.map((locale) => ({
      documentId,
      versionId,
      locale,
      fallback: [],
    })),
  });
  return Object.fromEntries(data.map((item) => [item.locale, item.data]));
}

export function inputPatches(state: ContentState, input: LanguageInput): LocaleData {
  return input.dataByLocale ?? { [state.locale]: input.data ?? {} };
}

function assertPatches(
  state: ContentState,
  input: { current: LocaleData; dataByLocale: LocaleData; patches: LocaleData },
): void {
  for (const [locale, patch] of Object.entries(input.patches)) {
    const next = localeData(input.dataByLocale, locale);
    assertWritableData({
      collection: state.collection,
      data: patch,
      previous: localeData(input.current, locale),
      next,
      context: policyContext({ ...state, locale }, next),
    });
  }
}

function transformLocales(
  state: ContentState,
  input: { current: LocaleData; requested: readonly string[] },
): LocaleData {
  const patches: LocaleData = {};
  for (const locale of input.requested) {
    let next = localeData(input.current, locale);
    for (const extension of state.collection.extensions ?? [])
      if (extension.transform) next = extension.transform(structuredClone(next));
    patches[locale] = next;
  }
  return patches;
}

export function prepareLocaleWrite(
  state: ContentState,
  input: { runtime: ContentRuntime; current: LocaleData; patches: LocaleData; creating?: boolean },
) {
  const first = normalizeLocaleData({
    collection: state.collection,
    current: input.current,
    patches: input.patches,
    limits: input.runtime.limits,
    applyDefaults: input.creating === true,
  });
  assertPatches(state, { current: input.current, ...first });
  const transformed = transformLocales(state, {
    current: first.dataByLocale,
    requested: Object.keys(input.patches),
  });
  const result = normalizeLocaleData({
    collection: state.collection,
    current: first.dataByLocale,
    patches: transformed,
    limits: input.runtime.limits,
    applyDefaults: false,
  });
  for (const data of Object.values(result.dataByLocale))
    for (const extension of state.collection.extensions ?? [])
      if (extension.validate && !extension.validate(data)) fail('invalid_input');
  const references = Object.entries(result.dataByLocale).flatMap(([locale, data]) =>
    referencesForLocale({
      collection: state.collection,
      data,
      locale,
      limits: input.runtime.limits,
    }),
  );
  return { ...result, references };
}

export function prepareLocaleSnapshot(
  state: ContentState,
  input: { runtime: ContentRuntime; current: LocaleData; next: LocaleData },
) {
  const first = normalizeLocaleData({
    collection: state.collection,
    patches: input.next,
    limits: input.runtime.limits,
    applyDefaults: false,
  });
  const patches = Object.fromEntries(
    Object.entries(first.dataByLocale).map(([locale, data]) => [
      locale,
      snapshotPatch({
        fields: state.collection.fields,
        previous: localeData(input.current, locale),
        next: data,
      }),
    ]),
  );
  assertPatches(state, { current: input.current, dataByLocale: first.dataByLocale, patches });
  const transformed = transformLocales(state, {
    current: first.dataByLocale,
    requested: Object.keys(input.next),
  });
  const result = normalizeLocaleData({
    collection: state.collection,
    patches: transformed,
    limits: input.runtime.limits,
    applyDefaults: false,
  });
  for (const data of Object.values(result.dataByLocale))
    for (const extension of state.collection.extensions ?? [])
      if (extension.validate && !extension.validate(data)) fail('invalid_input');
  const references = Object.entries(result.dataByLocale).flatMap(([locale, data]) =>
    referencesForLocale({
      collection: state.collection,
      data,
      locale,
      limits: input.runtime.limits,
    }),
  );
  return { ...result, references };
}
