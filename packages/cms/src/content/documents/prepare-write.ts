import { prepareNativeSlugs } from './native-slugs.ts';
import { validateDraftData } from '../lifecycle/draft-validation.ts';
import { policyScope } from '../hooks/invoke.ts';
import { transformHooks } from '../hooks/api.ts';
import { functionScope } from '../hooks/invoke.ts';
import { normalizeLocaleData } from '../fields/normalize-locale-data.ts';
import { assertWritableData, assertValidationData } from '../fields/policy-write.ts';
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

async function assertPatches(
  state: ContentState,
  input: {
    current: LocaleData;
    dataByLocale: LocaleData;
    patches: LocaleData;
    documentId?: string;
    access?: 'validate';
  },
): Promise<void> {
  for (const [locale, patch] of Object.entries(input.patches)) {
    const next = localeData(input.dataByLocale, locale);
    await (input.access === 'validate' ? assertValidationData : assertWritableData)({
      ...policyScope(state),
      collection: state.collection,
      data: patch,
      previous: localeData(input.current, locale),
      next,
      context: {
        ...policyContext({ ...state, locale }, next),
        ...(input.documentId ? { documentId: input.documentId } : {}),
      },
    });
  }
}

async function transformLocales(
  state: ContentState,
  input: {
    current: LocaleData;
    previous: LocaleData;
    requested: readonly string[];
    runtime: ContentRuntime;
    stage: 'beforeValidate' | 'beforeChange';
  },
): Promise<LocaleData> {
  const result: LocaleData = {};
  for (const locale of input.requested)
    result[locale] = await transformHooks(
      { ...state, locale },
      {
        stage: input.stage,
        data: localeData(input.current, locale),
        limits: input.runtime.limits,
        context: { previousData: localeData(input.previous, locale) },
      },
    );
  return result;
}

function changedPatches(state: ContentState, current: LocaleData, next: LocaleData): LocaleData {
  return Object.fromEntries(
    Object.entries(next).map(([locale, data]) => [
      locale,
      snapshotPatch({
        fields: state.collection.fields,
        previous: localeData(current, locale),
        next: data,
      }),
    ]),
  );
}

function localeReferences(state: ContentState, runtime: ContentRuntime, dataByLocale: LocaleData) {
  return Object.entries(dataByLocale).flatMap(([locale, data]) =>
    referencesForLocale({ collection: state.collection, data, locale, limits: runtime.limits }),
  );
}
async function nativeLocales(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    current: LocaleData;
    requested: readonly string[];
    normalized: Awaited<ReturnType<typeof normalizeLocaleData>>;
    documentId?: string;
  },
) {
  return {
    ...input.normalized,
    dataByLocale: await prepareNativeSlugs(state, {
      runtime: input.runtime,
      dataByLocale: input.normalized.dataByLocale,
      previous: input.current,
      requested: input.requested,
      ...(input.documentId ? { documentId: input.documentId } : {}),
    }),
  };
}

async function finishWrite(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    current: LocaleData;
    first: LocaleData;
    requested: readonly string[];
    snapshot?: boolean;
    documentId?: string;
    access?: 'validate';
    validationLocales?: readonly string[];
  },
) {
  const transformed = await transformLocales(state, {
    runtime: input.runtime,
    current: input.first,
    previous: input.current,
    requested: input.requested,
    stage: 'beforeChange',
  });
  const result = await normalizeLocaleData({
    collection: state.collection,
    ...(input.snapshot ? {} : { current: input.first }),
    patches: await prepareNativeSlugs(state, {
      runtime: input.runtime,
      dataByLocale: transformed,
      previous: input.first,
      requested: input.requested,
      ...(input.documentId ? { documentId: input.documentId } : {}),
    }),
    limits: input.runtime.limits,
    functions: functionScope(state),
    validateRules: false,
    applyDefaults: false,
  });
  await validateDraftData(state, { ...input, dataByLocale: result.dataByLocale });
  await assertPatches(state, {
    current: input.current,
    dataByLocale: result.dataByLocale,
    patches: changedPatches(state, input.current, result.dataByLocale),
    ...(input.documentId ? { documentId: input.documentId } : {}),
    ...(input.access ? { access: input.access } : {}),
  });
  return { ...result, references: localeReferences(state, input.runtime, result.dataByLocale) };
}

export async function prepareLocaleWrite(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    current: LocaleData;
    patches: LocaleData;
    creating?: boolean;
    documentId?: string;
    access?: 'validate';
    validationLocales?: readonly string[];
  },
) {
  const requested = Object.keys(input.patches);
  const patches = await transformLocales(state, {
    runtime: input.runtime,
    current: input.patches,
    previous: input.current,
    requested,
    stage: 'beforeValidate',
  });
  const normalized = await normalizeLocaleData({
    collection: state.collection,
    current: input.current,
    patches,
    limits: input.runtime.limits,
    functions: functionScope(state),
    validateRules: false,
    applyDefaults: input.creating === true,
  });
  const first = await nativeLocales(state, { ...input, normalized, requested });
  await assertPatches(state, {
    current: input.current,
    ...first,
    ...(input.documentId ? { documentId: input.documentId } : {}),
    ...(input.access ? { access: input.access } : {}),
  });
  return finishWrite(state, {
    runtime: input.runtime,
    current: input.current,
    first: first.dataByLocale,
    requested,
    ...(input.documentId ? { documentId: input.documentId } : {}),
    ...(input.access ? { access: input.access } : {}),
    ...(input.validationLocales ? { validationLocales: input.validationLocales } : {}),
  });
}

export async function prepareLocaleSnapshot(
  state: ContentState,
  input: { runtime: ContentRuntime; current: LocaleData; next: LocaleData; documentId?: string },
) {
  const requested = Object.keys(input.next);
  const patches = await transformLocales(state, {
    runtime: input.runtime,
    current: input.next,
    previous: input.current,
    requested,
    stage: 'beforeValidate',
  });
  const first = await normalizeLocaleData({
    collection: state.collection,
    patches,
    limits: input.runtime.limits,
    functions: functionScope(state),
    validateRules: false,
    applyDefaults: false,
  });
  await assertPatches(state, {
    current: input.current,
    dataByLocale: first.dataByLocale,
    patches: changedPatches(state, input.current, first.dataByLocale),
    ...(input.documentId ? { documentId: input.documentId } : {}),
  });
  return finishWrite(state, {
    runtime: input.runtime,
    current: input.current,
    first: first.dataByLocale,
    requested,
    validationLocales: [state.locale],
    snapshot: true,
    ...(input.documentId ? { documentId: input.documentId } : {}),
  });
}
