import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/result';
import { documentSchema, documentPageSchema } from '../../contracts/documents';
import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import type { FieldData, FieldServices, ReferenceQuery } from '../fields/types';
import type { EditorSnapshot } from './editor-read';
import { editorCandidate } from './editor-candidate';
import { documentTitle } from './query';

interface ReferenceEditor {
  snapshot: EditorSnapshot;
  data: FieldData;
}

interface ReferenceBatch {
  collection: string;
  locale: string;
  documents: readonly Document[];
  data: FieldData;
}

function referenceContextKey(editor: ReferenceEditor | ReferenceBatch): string {
  return JSON.stringify(
    'snapshot' in editor
      ? editorCandidate(editor.snapshot, editor.data)
      : {
          collection: editor.collection,
          locale: editor.locale,
          data: editor.data,
          documents: editor.documents.map(({ id, revision }) => ({ id, revision })),
        },
  );
}

function optionCandidates(input: ReferenceQuery, editor: ReferenceEditor | ReferenceBatch) {
  if ('snapshot' in editor) {
    if (
      editor.snapshot.editor.intent === 'read' ||
      editor.snapshot.editor.mode !== 'editing' ||
      editor.snapshot.editor.locale !== input.locale ||
      !input.sourcePath
    )
      throw new Error('Invalid reference context');
    return {
      collection: editor.snapshot.collection.key,
      candidate: editorCandidate(editor.snapshot, editor.data),
    };
  }
  if (
    editor.locale !== input.locale ||
    !input.sourcePath ||
    editor.documents.length === 0 ||
    editor.documents.some((document) => document.collection !== editor.collection)
  )
    throw new Error('Invalid reference context');
  return {
    collection: editor.collection,
    candidate: editor.documents.map((document) => ({
      collection: editor.collection,
      locale: editor.locale,
      mode: 'editing',
      ...(input.context ? { context: input.context } : {}),
      intent: 'update',
      id: document.id,
      revision: document.revision,
      data: editor.data,
    })),
  };
}

function referenceRequest(input: ReferenceQuery, editor?: ReferenceEditor | ReferenceBatch) {
  if (input.id && !input.filterOptions)
    return requestApi({
      operation: 'documents.get',
      params: { collection: input.collection, id: input.id },
      query: { locale: input.locale, fallback: [], mode: 'editing', depth: 0 },
      response: documentSchema,
      signal: input.signal,
    }).then((result) =>
      result.ok
        ? { ...result, data: { rows: [result.data], total: 1, page: 1, pageSize: 1 } }
        : result,
    );
  if (input.filterOptions) {
    if (!editor) throw new Error('Invalid reference context');
    const { collection, candidate } = optionCandidates(input, editor);
    return requestApi({
      operation: 'collections.fieldOptions',
      params: { collection },
      body: {
        candidate,
        path: input.sourcePath,
        relationTo: input.collection,
        q: input.query,
        ...(input.id ? { id: input.id } : {}),
        page: input.page,
        pageSize: 20,
      },
      response: documentPageSchema,
      signal: input.signal,
    });
  }
  return requestApi({
    operation: 'documents.list',
    params: { collection: input.collection },
    query: {
      q: input.query,
      page: input.page,
      pageSize: 20,
      locale: input.locale,
      fallback: [],
      depth: 0,
      mode: 'editing',
    },
    response: documentPageSchema,
    signal: input.signal,
  });
}

export function referenceServices(
  collections: readonly Collection[],
  report: (result: ApiResult<unknown>) => void,
  editor?: ReferenceEditor | ReferenceBatch,
): FieldServices {
  return {
    ...(editor ? { referenceContextKey: referenceContextKey(editor) } : {}),
    collections: collections.map((collection) => ({
      id: collection.key,
      label: collection.label,
      upload: collection.upload,
      locales: collection.locales,
      defaultLocale: collection.defaultLocale,
      richTextLink: collection.admin?.enableRichTextLink !== false,
      richTextRelationship: collection.admin?.enableRichTextRelationship !== false,
    })),
    async searchReferences(input) {
      if (!input.collections.includes(input.collection))
        throw new Error('Invalid reference collection');
      const collection = collections.find((candidate) => candidate.key === input.collection);
      const values =
        !input.filterOptions && collection && !collection.locales.includes(input.locale)
          ? { ...input, locale: collection.defaultLocale }
          : input;
      const result = await referenceRequest(values, editor);
      if (!result.ok) {
        report(result);
        throw new Error(result.error.code);
      }
      return {
        ...result.data,
        rows: result.data.rows.map((document) => ({
          collection: document.collection,
          id: document.id,
          label: documentTitle(document, collection),
        })),
      };
    },
  };
}
