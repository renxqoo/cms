import { collectReferences } from '../fields/collect-references.ts';
import { projectData } from '../fields/policies.ts';
import { historicalLocale } from '../fields/remap-locale.ts';
import { remapReferencePath } from '../fields/remap-reference-path.ts';
import { fieldPaths } from '../fields/structure.ts';
import { authorizeStateOperation, collectionPredicate, policyContext } from '../runtime.ts';
import { denied, targetState } from './relation-scopes.ts';
import { visibleDocuments } from './visible-documents.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';
import type { InboundReference } from '../adapters/postgres/store-contract.ts';

export interface ReferenceSummary {
  collection: string;
  id: string;
  versionId: string;
  sourcePath: string;
}
interface LocatedReference {
  reference: InboundReference;
  locale: string;
  path: string;
}

async function historyState(
  state: ContentState,
  runtime: ContentRuntime,
): Promise<ContentState | undefined> {
  try {
    const actor = await authorizeStateOperation(state, {
      runtime,
      operationId: 'versions.get',
      collection: state.collection.key,
    });
    if (!actor || !state.collection.history) return undefined;
    const { predicate: _old, ...base } = state;
    const next = { ...base, actor, operationId: 'versions.get' };
    const predicate = collectionPredicate(next);
    return { ...next, ...(predicate ? { predicate } : {}) };
  } catch (error) {
    if (!denied(error)) throw error;
    return undefined;
  }
}

function referenceLocation(
  state: ContentState,
  input: { runtime: ContentRuntime; reference: InboundReference },
): LocatedReference | undefined {
  const { reference } = input;
  if (!fieldPaths(state.collection.fields).some(({ field }) => field.id === reference.fieldId))
    return undefined;
  const separator = reference.path.indexOf(':');
  const rawLocale = separator >= 0 ? reference.path.slice(0, separator) : state.locale;
  const locale = state.collection.locales.supported.find(
    (candidate) =>
      historicalLocale({
        current: state.collection,
        schemaVersion: reference.schemaVersion,
        locale: candidate,
      }) === rawLocale,
  );
  if (locale === undefined) return undefined;
  const rawPath = separator >= 0 ? reference.path.slice(separator + 1) : reference.path;
  const path = remapReferencePath({
    from: input.runtime.store.definition(state.collection.key, reference.schemaVersion),
    to: state.collection,
    path: rawPath,
    fieldId: reference.fieldId,
  });
  return { reference, locale, path };
}

function visibleReference(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    item: LocatedReference;
    data: DocumentData;
    target: { id: string; collection: string };
  },
): boolean {
  const data = projectData({
    collection: state.collection,
    data: input.data,
    context: policyContext({ ...state, locale: input.item.locale }, input.data),
  });
  return collectReferences({
    collection: state.collection,
    data,
    locale: input.item.locale,
    limits: input.runtime.limits,
  }).some(
    (item) =>
      item.id === input.target.id &&
      item.collection === input.target.collection &&
      item.path === input.item.path,
  );
}

function readReferenceData(
  reader: ContentState,
  input: { runtime: ContentRuntime; items: readonly LocatedReference[] },
) {
  return input.runtime.store.readRevisionDataBatch(reader.tx, {
    collection: reader.collection.key,
    items: input.items.map(({ reference, locale }) => ({
      documentId: reference.sourceDocumentId,
      versionId: reference.sourceRevisionId,
      locale,
      fallback: [],
    })),
  });
}

async function projectLocaleReferences(
  reader: ContentState,
  input: {
    runtime: ContentRuntime;
    items: readonly LocatedReference[];
    target: { id: string; collection: string };
  },
): Promise<ReferenceSummary[]> {
  const ids = input.items.map(({ reference }) => reference.sourceDocumentId);
  const current = await visibleDocuments(reader, { runtime: input.runtime, ids });
  const historical = await historyState(reader, input.runtime);
  const oldVisible = historical
    ? await visibleDocuments(historical, { runtime: input.runtime, ids })
    : new Map();
  const contextFor = (reference: InboundReference): ContentState | null => {
    const document = current.get(reference.sourceDocumentId);
    if (!document) return null;
    if (
      document.currentVersionId === reference.sourceRevisionId ||
      document.publishedVersionId === reference.sourceRevisionId
    )
      return reader;
    return oldVisible.has(reference.sourceDocumentId) ? (historical ?? null) : null;
  };
  const allowed = input.items.filter(({ reference }) => contextFor(reference));
  const decoded = await readReferenceData(reader, { runtime: input.runtime, items: allowed });
  const rows: ReferenceSummary[] = [];
  for (const item of allowed) {
    const { reference } = item;
    const data = decoded.find(
      (value) =>
        value.documentId === reference.sourceDocumentId &&
        value.versionId === reference.sourceRevisionId &&
        value.locale === item.locale,
    )?.data;
    const context = contextFor(reference);
    if (data && context && visibleReference(context, { ...input, item, data }))
      rows.push({
        collection: reader.collection.key,
        id: reference.sourceDocumentId,
        versionId: reference.sourceRevisionId,
        sourcePath: `${item.locale}:${item.path}`,
      });
  }
  return rows;
}

export async function projectReferenceGroup(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    collection: string;
    references: readonly InboundReference[];
    targetId: string;
  },
): Promise<ReferenceSummary[]> {
  const collection = await input.runtime.resolveCollection(state.tx, input.collection);
  const located = input.references
    .map((reference) =>
      referenceLocation({ ...state, collection }, { runtime: input.runtime, reference }),
    )
    .filter((item): item is LocatedReference => item !== undefined);
  const rows: ReferenceSummary[] = [];
  for (const locale of new Set(located.map((item) => item.locale))) {
    try {
      const reader = await targetState(
        { ...state, locale },
        { runtime: input.runtime, collection: input.collection },
      );
      rows.push(
        ...(await projectLocaleReferences(reader, {
          runtime: input.runtime,
          items: located.filter((item) => item.locale === locale),
          target: { collection: state.collection.key, id: input.targetId },
        })),
      );
    } catch (error) {
      if (!denied(error)) throw error;
    }
  }
  return rows;
}
