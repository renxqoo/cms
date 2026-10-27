import { fail } from '@new-cms/cms/platform/contracts';
import { collectionPredicate, permittedQueryFields, policyRelations } from '../runtime.ts';
import { denied } from './relation-scopes.ts';
import { allLocaleData } from '../fields/all-locales.ts';
import { storedViews } from './stored-views.ts';
import { decorateDocuments } from './project-assets.ts';
import { expandRelations } from './expand-relations.ts';
import type { ContentRuntime, ContentState, ContentDocumentView } from '../types.ts';
import type { StoredDocument } from '../model.ts';

export function readLocaleInput(locale: string | undefined, fallback?: readonly string[]) {
  if (locale !== 'all') return locale ? { locale } : {};
  if (fallback?.length) fail('invalid_input');
  return { fallbackOverride: [] };
}

async function historicalRows(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    rows: StoredDocument[];
    historical?: { id: string; schemaVersion: number };
  },
): Promise<StoredDocument[]> {
  if (!input.historical) return input.rows;
  const { historical } = input;
  const data = await input.runtime.store.readRevisionDataBatch(state.tx, {
    collection: state.collection.key,
    items: input.rows.map((row) => ({
      documentId: row.document.id,
      versionId: historical.id,
      locale: state.locale,
      fallback: [],
    })),
  });
  return input.rows.map((row) => ({
    ...row,
    version: { ...row.version, id: historical.id, schemaVersion: historical.schemaVersion },
    data: data.find((entry) => entry.documentId === row.document.id)?.data ?? {},
  }));
}

interface AllLocalesInput {
  runtime: ContentRuntime;
  views: ContentDocumentView[];
  select?: readonly string[];
  depth: number;
  historical?: { id: string; schemaVersion: number };
}

async function localeReader(state: ContentState, locale: string): Promise<ContentState | null> {
  const { predicate: _predicate, ...base } = state;
  const localized = { ...base, locale, fallbackOverride: [] };
  try {
    const predicate = await collectionPredicate(localized);
    return { ...localized, ...(predicate ? { predicate } : {}) };
  } catch (error) {
    if (!denied(error)) throw error;
    return null;
  }
}

async function localeViews(
  state: ContentState,
  input: AllLocalesInput,
  locale: string,
): Promise<ContentDocumentView[] | null> {
  const { runtime } = input;
  const reader = await localeReader(state, locale);
  if (!reader) return null;
  const result = await runtime.store.queryDocuments(state.tx, {
    collection: state.collection.key,
    query: {
      page: 1,
      pageSize: input.views.length,
      locale,
      fallback: [],
      mode: state.mode,
      sort: [{ field: 'id', order: 'asc' }],
      trashed: input.views[0]?.trashedAt !== null,
      where: { field: 'id', operator: 'in', value: input.views.map((view) => view.id) },
      ...(reader.predicate ? { policy: reader.predicate } : {}),
    },
    queryableFields: await permittedQueryFields(reader),
    ...(await policyRelations(reader, runtime)),
    limits: runtime.limits,
  });
  const stored = await historicalRows(reader, { ...input, rows: result.rows });
  return renderLocaleViews(reader, input, stored);
}

async function renderLocaleViews(
  reader: ContentState,
  input: AllLocalesInput,
  stored: StoredDocument[],
) {
  const { runtime } = input;
  const views = await storedViews(reader, stored, input);
  await decorateDocuments(reader, {
    runtime,
    views,
    schemaVersions: new Map(stored.map((row) => [row.version.id, row.version.schemaVersion])),
    fallback: [],
  });
  await expandRelations(reader, {
    runtime,
    views,
    ...(input.select ? { select: input.select } : {}),
    depth: input.depth,
    budget: (reader.expansionBudget ??= { nodes: 0 }),
  });
  return views;
}
function mergeLocaleViews(
  state: ContentState,
  input: AllLocalesInput,
  locales: ReadonlyMap<string, ReadonlyMap<string, ContentDocumentView>>,
) {
  for (const view of input.views) {
    const byLocale = Object.fromEntries(
      [...locales].flatMap(([locale, views]) => {
        const item = views.get(view.id);
        return item ? [[locale, item.data]] : [];
      }),
    );
    const data = allLocaleData({
      fields: state.collection.fields,
      base: view.data,
      values: byLocale,
      registry: input.runtime.registry,
    });
    const bindings = new Map(
      [...locales.values()].flatMap((items) =>
        (items.get(view.id)?.mediaBindings ?? []).map(
          (binding) => [binding.bindingId, binding] as const,
        ),
      ),
    );
    view.data = data;
    if (view.mediaBindings) view.mediaBindings = [...bindings.values()];
  }
}

export async function projectAllLocales(
  state: ContentState,
  input: AllLocalesInput,
): Promise<void> {
  if (input.views.length === 0) return;
  const locales = new Map<string, Map<string, ContentDocumentView>>([
    [state.locale, new Map(input.views.map((view) => [view.id, view]))],
  ]);
  for (const locale of state.collection.locales.supported) {
    if (locale === state.locale) continue;
    const views = await localeViews(state, input, locale);
    if (views) locales.set(locale, new Map(views.map((view) => [view.id, view])));
  }
  mergeLocaleViews(state, input, locales);
}
