import type { AuthorizedManifest } from '@new-cms/cms/assets/composition';
import { randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import { auditContent, requireAdditionalOperation } from '../runtime.ts';

import { authorizeReferences, referencesForLocale } from './revision-data.ts';
import { bindRevisionAssets } from './bind-assets.ts';
import type { RevisionMediaSources } from './bind-assets.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData, ReferenceValue } from '../definition.ts';
import type { DocumentRow } from '../model.ts';
import { enqueueExtensionWork } from '../jobs/extension-work.ts';
import { validatePublicationRevision } from './validate-publication.ts';
import { assertFolder } from '../folders/store.ts';
import { validateHierarchyRevision, validateHierarchyReferences } from '../hierarchy/validation.ts';
import { observeRevision } from '../hooks/revision.ts';
import { assertFieldOptions } from '../fields/filter-options.ts';

export interface RevisionWrite {
  runtime: ContentRuntime;
  documentId: string;
  data: DocumentData;
  dataByLocale?: Readonly<Record<string, DocumentData>>;
  kind: string;
  previous?: DocumentRow;
  source?: { documentId: string; revisionId: string };
  uploadId?: string;
  fileManifest?: AuthorizedManifest;
  folderId?: string | null;
  mediaSources?: RevisionMediaSources;
}

async function revisionReferences(
  state: ContentState,
  input: { runtime: ContentRuntime; documentId: string; revisionId: string },
): Promise<ReferenceValue[]> {
  const references: ReferenceValue[] = [];
  for (const locale of state.collection.locales.supported) {
    const data = await input.runtime.store.readRevisionData(state.tx, {
      collection: state.collection.key,
      documentId: input.documentId,
      versionId: input.revisionId,
      locale,
      fallback: [],
    });
    await assertFieldOptions(
      { ...state, locale },
      { runtime: input.runtime, data, documentId: input.documentId },
    );
    references.push(
      ...referencesForLocale({
        collection: state.collection,
        data,
        locale,
        limits: input.runtime.limits,
      }),
    );
  }
  return references;
}

function revisionSource(input: RevisionWrite) {
  if (input.dataByLocale) return { dataByLocale: input.dataByLocale };
  const source = input.source?.revisionId ?? input.previous?.currentVersionId;
  return source ? { previousVersionId: source } : {};
}

async function insertRevision(state: ContentState, input: RevisionWrite, revisionId: string) {
  return input.runtime.store.insertRevision(state.tx, {
    collection: state.collection.key,
    documentId: input.documentId,
    id: revisionId,
    revision: (input.previous?.revision ?? 0) + 1,
    actorId: state.actor.id,
    data: input.data,
    locale: state.locale,
    schemaVersion: state.collection.schemaVersion,
    kind: input.kind,
    ...revisionSource(input),
  });
}

async function registerRevisionReferences(
  state: ContentState,
  input: RevisionWrite & { revisionId: string },
): Promise<void> {
  const references = await revisionReferences(state, input);
  await authorizeReferences(state, { runtime: input.runtime, references });
  await validateHierarchyReferences(state, { runtime: input.runtime, references });
  await input.runtime.store.writeReferences(state.tx, {
    collection: state.collection.key,
    documentId: input.documentId,
    versionId: input.revisionId,
    references,
  });
  const previous =
    input.source ??
    (input.previous
      ? { documentId: input.previous.id, revisionId: input.previous.currentVersionId }
      : undefined);
  await bindRevisionAssets(state, {
    runtime: input.runtime,
    documentId: input.documentId,
    revisionId: input.revisionId,
    references,
    requireSourceRead: input.source !== undefined,
    creating: input.previous === undefined,
    ...(input.fileManifest ? { fileManifest: input.fileManifest } : {}),
    ...(input.mediaSources ? { mediaSources: input.mediaSources } : {}),
    ...(input.uploadId ? { uploadId: input.uploadId } : {}),
    ...(input.previous ? { expectedRevision: input.previous.revision } : {}),
    ...(previous ? { previous } : {}),
  });
}

async function commitRevision(
  state: ContentState,
  input: RevisionWrite & { revisionId: string },
): Promise<void> {
  await input.runtime.store.updateDocumentPointers(state.tx, {
    actorId: state.actor.id,
    collection: state.collection.key,
    id: input.documentId,
    expectedRevision: input.previous?.revision ?? 0,
    revision: (input.previous?.revision ?? 0) + 1,
    currentVersionId: input.revisionId,
    locale: state.locale,
    publishedVersionId:
      state.collection.mode === 'direct'
        ? input.revisionId
        : (input.previous?.publishedVersionId ?? null),
    ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
  });
  if (input.uploadId)
    await requireAdditionalOperation(state, {
      runtime: input.runtime,
      operationId: input.kind === 'fileProcessed' ? 'assets.reprocess' : 'assets.completeUpload',
      id: input.documentId,
    });
  await input.runtime.store.syncActiveProjections(state.tx, {
    collection: state.collection.key,
    id: input.documentId,
  });
  await auditContent(state, {
    runtime: input.runtime,
    id: input.documentId,
    detail: { kind: input.kind, revision: (input.previous?.revision ?? 0) + 1 },
  });
  await enqueueExtensionWork(state, input);
}

export async function writeRevision(
  state: ContentState,
  input: RevisionWrite,
): Promise<{ id: string; versionId: string }> {
  if (input.runtime.limits.maxDataBytes < Buffer.byteLength(JSON.stringify(input.data)))
    fail('payload_too_large');
  if (input.folderId !== undefined)
    await assertFolder(state, { runtime: input.runtime, folderId: input.folderId });
  const revisionId = randomUUID();
  await insertRevision(state, input, revisionId);
  await validateHierarchyRevision(state, {
    runtime: input.runtime,
    documentId: input.documentId,
    revisionId,
  });
  await validateEffectiveRevision(state, { ...input, revisionId });
  const revision = { ...input, revisionId };
  await registerRevisionReferences(state, revision);
  await commitRevision(state, revision);
  await observeRevision(state, input);
  return { id: input.documentId, versionId: revisionId };
}

async function validateEffectiveRevision(
  state: ContentState,
  input: RevisionWrite & { revisionId: string },
): Promise<void> {
  if (state.collection.mode === 'direct')
    await validatePublicationRevision(state, {
      runtime: input.runtime,
      documentId: input.documentId,
      versionId: input.revisionId,
    });
}
