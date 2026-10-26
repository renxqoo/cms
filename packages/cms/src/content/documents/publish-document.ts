import { projectDocument } from '../documents/project-document.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  auditContent,
  createRunner,
  ensureVisible,
  idempotentReference,
  parse,
  requireRevision,
} from '../runtime.ts';
import { lockRevisionResources } from './revision-data.ts';
import { validatePublicationRevision } from './validate-publication.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

export async function publishInTransaction(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; revision: number; versionId?: string },
): Promise<{ id: string; versionId: string }> {
  if (state.collection.mode !== 'drafts') fail('invalid_input');
  const current = await ensureVisible(state, { runtime: input.runtime, id: input.id });
  const document = await lockRevisionResources(state, {
    runtime: input.runtime,
    document: current,
    revision: input.revision,
  });
  if (input.versionId && document.currentVersionId !== input.versionId) fail('version_conflict');
  await validatePublicationRevision(state, {
    runtime: input.runtime,
    documentId: document.id,
    versionId: document.currentVersionId,
  });
  await input.runtime.store.updateDocumentPointers(state.tx, {
    collection: state.collection.key,
    id: document.id,
    expectedRevision: input.revision,
    revision: input.revision + 1,
    currentVersionId: document.currentVersionId,
    publishedVersionId: document.currentVersionId,
    locale: state.locale,
  });
  await input.runtime.store.syncActiveUnique(state.tx, {
    collection: state.collection.key,
    id: document.id,
  });
  await auditContent(state, {
    runtime: input.runtime,
    id: document.id,
    detail: { kind: 'published', versionId: document.currentVersionId },
  });
  return { id: document.id, versionId: document.currentVersionId };
}

async function publishDocument(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.publish'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'documents.publish', collection: input.collection, ...(input.locale ? { locale: input.locale } : {}) },
    async (state) => {
      const result = await idempotentReference(state, { runtime, input }, () =>
        publishInTransaction(state, { runtime, id: input.id, revision: input.revision }),
      );
      return projectDocument(state, {
        runtime,
        document: await ensureVisible(state, { runtime, id: result.id }),
      });
    },
  );
}

async function unpublishDocument(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.unpublish'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'documents.unpublish', collection: input.collection, ...(input.locale ? { locale: input.locale } : {}) },
    async (state) => {
      await unpublishInTransaction(state, { runtime, id: input.id, revision: input.revision });
      return projectDocument(state, {
        runtime, document: await ensureVisible(state, { runtime, id: input.id }),
      });
    },
  );
}

export async function unpublishInTransaction(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; revision: number; versionId?: string },
): Promise<{ id: string; versionId: string }> {
  if (state.collection.mode !== 'drafts') fail('invalid_input');
  const document = await ensureVisible(state, { runtime: input.runtime, id: input.id, lock: true });
  requireRevision(document, input.revision);
  if (input.versionId && document.publishedVersionId !== input.versionId) fail('version_conflict');
  if (!document.publishedVersionId) return { id: document.id, versionId: document.currentVersionId };
  await input.runtime.store.updateDocumentPointers(state.tx, {
    collection: state.collection.key,
    id: input.id,
    expectedRevision: input.revision,
    revision: input.revision + 1,
    currentVersionId: document.currentVersionId,
    publishedVersionId: null,
    locale: state.locale,
  });
  await input.runtime.store.syncActiveUnique(state.tx, { collection: state.collection.key, id: input.id });
  await auditContent(state, { runtime: input.runtime, id: input.id, detail: { kind: 'unpublished' } });
  return { id: document.id, versionId: document.currentVersionId };
}

export function createPublicationApi(runtime: ContentRuntime) {
  return {
    publishDocument: (ctx: RequestContext, raw: unknown) => publishDocument(runtime, ctx, raw),
    unpublishDocument: (ctx: RequestContext, raw: unknown) => unpublishDocument(runtime, ctx, raw),
  };
}
