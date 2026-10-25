import { fail } from '@new-cms/cms/platform/contracts';
import { objectValue } from '../fields/json-value.ts';
import { targetState } from './relation-scopes.ts';
import { visibleDocuments } from './visible-documents.ts';
import { collectReferences } from '../fields/collect-references.ts';
import { ensureVisible, requireRevision } from '../runtime.ts';
import type { DocumentData, ReferenceValue } from '../definition.ts';
import type { DocumentRow } from '../model.ts';
import type { ContentRuntime, ContentState, ContentWriteInput } from '../types.ts';

export async function currentData(
  state: ContentState,
  input: { runtime: ContentRuntime; document: DocumentRow; versionId?: string; locale?: string },
): Promise<DocumentData> {
  return input.runtime.store.readRevisionData(state.tx, {
    collection: state.collection.key,
    documentId: input.document.id,
    versionId: input.versionId ?? input.document.currentVersionId,
    locale: input.locale ?? state.locale,
    fallback: [],
  });
}

export async function allRevisionReferences(
  state: ContentState,
  input: { runtime: ContentRuntime; document: DocumentRow; versionId?: string },
): Promise<ReferenceValue[]> {
  const values = await input.runtime.store.readRevisionDataBatch(state.tx, {
    collection: state.collection.key,
    items: state.collection.locales.supported.map((locale) => ({
      documentId: input.document.id,
      versionId: input.versionId ?? input.document.currentVersionId,
      locale,
      fallback: [],
    })),
  });
  return values.flatMap(({ locale, data }) =>
    referencesForLocale({
      collection: state.collection,
      data,
      locale,
      limits: input.runtime.limits,
    }),
  );
}

export async function lockRevisionResources(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    document: DocumentRow;
    revision: number;
    references?: readonly ReferenceValue[];
    trashed?: boolean;
  },
): Promise<DocumentRow> {
  const oldReferences = await allRevisionReferences(state, input);
  const ids = [
    input.document.id,
    ...oldReferences.map((reference) => reference.id),
    ...(input.references ?? []).map((reference) => reference.id),
  ];
  await input.runtime.store.lockDocuments(state.tx, { ids: [...new Set(ids)].toSorted() });
  const document = await ensureVisible(state, {
    runtime: input.runtime,
    id: input.document.id,
    ...(input.trashed ? { trashed: true } : {}),
  });
  requireRevision(document, input.revision);
  return document;
}

export async function authorizeReferences(
  state: ContentState,
  input: { runtime: ContentRuntime; references: readonly ReferenceValue[] },
): Promise<void> {
  for (const collection of new Set(input.references.map((reference) => reference.collection))) {
    const reader = await targetState(state, { runtime: input.runtime, collection });
    const ids = [
      ...new Set(
        input.references
          .filter((reference) => reference.collection === collection)
          .map((reference) => reference.id),
      ),
    ];
    const visible = await visibleDocuments(reader, { runtime: input.runtime, ids, trashed: false });
    if (ids.some((id) => !visible.has(id))) fail('not_found');
  }
}

export function referencesForLocale(
  input: Parameters<typeof collectReferences>[0],
): ReferenceValue[] {
  return collectReferences(input).map((reference) => ({
    ...reference,
    path: `${input.locale}:${reference.path}`,
  }));
}

export function documentInput(value: unknown): DocumentData {
  if (!objectValue(value)) fail('invalid_input');
  return value;
}

export interface LanguageInput {
  data?: DocumentData | undefined;
  dataByLocale?: Record<string, DocumentData> | undefined;
  locale?: string | undefined;
}

export function languageInput(input: object): LanguageInput {
  const values: LanguageInput = {};
  if ('locale' in input && typeof input.locale === 'string') values.locale = input.locale;
  if ('data' in input && input.data !== undefined) values.data = documentInput(input.data);
  if ('dataByLocale' in input && input.dataByLocale !== undefined) {
    const source = documentInput(input.dataByLocale);
    values.dataByLocale = Object.fromEntries(
      Object.entries(source).map(([locale, data]) => [locale, documentInput(data)]),
    );
  }
  return values;
}

export function writeInput(input: {
  collection: string;
  id: string;
  revision: number;
  folderId?: string | null | undefined;
  uploadId?: string | undefined;
}): ContentWriteInput {
  return {
    collection: input.collection,
    id: input.id,
    revision: input.revision,
    ...languageInput(input),
    ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
    ...(input.uploadId === undefined ? {} : { uploadId: input.uploadId }),
  };
}
