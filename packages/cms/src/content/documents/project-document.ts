import { fail } from '@new-cms/cms/platform/contracts';
import { projectData } from '../fields/policies.ts';
import { targetReadContext } from '../queries/resolve-locale.ts';
import { policyContext } from '../runtime.ts';
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
  const projected = projectData({
    collection: state.collection,
    data,
    context: policyContext(state, data),
    ...(input.select ? { select: input.select } : {}),
  });
  const view = documentView(state, { document: input.document, versionId, data: projected });
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
