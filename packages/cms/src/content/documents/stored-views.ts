import { documentComponentProps } from '../editor/document-component-props.ts';
import { projectAuthorship } from '../authorship/api.ts';
import { projectReadData } from './project-data.ts';
import type { StoredDocument } from '../model.ts';
import type { ContentRuntime, ContentState, ContentDocumentView } from '../types.ts';

export async function storedView(
  state: ContentState,
  row: StoredDocument,
  input: { runtime: ContentRuntime; select?: readonly string[] | undefined },
): Promise<ContentDocumentView> {
  const { document } = row;
  const data = await projectReadData(state, {
    runtime: input.runtime,
    data: row.data,
    documentId: document.id,
    ...(input.select ? { select: input.select } : {}),
  });
  return {
    ...(await projectAuthorship(state, { runtime: input.runtime, document })),
    id: document.id,
    collection: state.collection.key,
    revision: document.revision,
    versionId: row.version.id,
    publishedVersionId: document.publishedVersionId,
    trashedAt: document.trashedAt,
    folderId: document.folderId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    data,
    ...(await documentComponentProps(state, {
      runtime: input.runtime,
      data,
      documentId: document.id,
    })),
  };
}

export async function storedViews(
  state: ContentState,
  rows: readonly StoredDocument[],
  input: { runtime: ContentRuntime; select?: readonly string[] | undefined },
): Promise<ContentDocumentView[]> {
  const views = [];
  for (const row of rows) views.push(await storedView(state, row, input));
  return views;
}
