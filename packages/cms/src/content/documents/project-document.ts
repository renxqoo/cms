import { documentComponentProps } from '../editor/document-component-props.ts';
import { projectAuthorship } from '../authorship/api.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { projectReadData } from './project-data.ts';
import { targetReadContext } from '../queries/resolve-locale.ts';
import { decorateDocuments } from './project-assets.ts';
import type { ContentRuntime, ContentState, ContentDocumentView } from '../types.ts';
import type { DocumentRow } from '../model.ts';

export async function projectDocument(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    document: DocumentRow;
    versionId?: string;
    select?: readonly string[];
    fallback?: readonly string[];
  },
): Promise<ContentDocumentView> {
  const { versionId, read, data } = await readProjectionData(state, input);
  const projected = await projectReadData(state, {
    runtime: input.runtime,
    data,
    documentId: input.document.id,
    ...(input.select ? { select: input.select } : {}),
  });
  const view = documentView(state, { document: input.document, versionId, data: projected });
  Object.assign(view, await projectAuthorship(state, input));
  Object.assign(
    view,
    await documentComponentProps(state, {
      runtime: input.runtime,
      data: projected,
      documentId: input.document.id,
    }),
  );
  const revision = await input.runtime.store.readRevision(state.tx, {
    collection: state.collection.key,
    documentId: input.document.id,
    versionId,
  });
  await decorateDocuments(state, {
    runtime: input.runtime,
    views: [view],
    schemaVersions: new Map([[versionId, revision.schemaVersion]]),
    fallback: read.fallback,
  });
  return view;
}

async function readProjectionData(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    document: DocumentRow;
    versionId?: string;
    fallback?: readonly string[];
  },
) {
  const versionId =
    input.versionId ??
    (state.mode === 'published'
      ? input.document.publishedVersionId
      : input.document.currentVersionId);
  if (!versionId) fail('not_found');
  const read = targetReadContext({
    collection: state.collection,
    locale: state.locale,
    ...((input.fallback ?? state.fallbackOverride)
      ? { fallback: input.fallback ?? state.fallbackOverride }
      : {}),
  });
  const data = await input.runtime.store.readRevisionData(state.tx, {
    collection: state.collection.key,
    documentId: input.document.id,
    versionId,
    ...read,
  });
  return { versionId, read, data };
}

function documentView(
  state: ContentState,
  input: { document: DocumentRow; versionId: string; data: ContentDocumentView['data'] },
): ContentDocumentView {
  const { document } = input;
  return {
    id: document.id,
    collection: state.collection.key,
    revision: document.revision,
    versionId: input.versionId,
    publishedVersionId: document.publishedVersionId,
    trashedAt: document.trashedAt,
    folderId: document.folderId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    data: input.data,
  };
}
