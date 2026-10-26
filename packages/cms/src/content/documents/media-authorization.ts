import { randomUUID } from 'node:crypto';
import { actorReference } from '@new-cms/cms/access';
import type { ActorReference } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import type {
  ContentAuthorizationInput,
  UploadSettings,
  ContentAuthorizer,
} from '@new-cms/cms/assets/composition';
import type { ContentRuntime, ContentState } from '../types.ts';
import {
  budgetedExecutor,
  collectionPredicate,
  ensureVisible,
  lockContentMutation,
  requireAdditionalOperation,
  requireRevision,
  resolveLocale,
  policyContext,
} from '../runtime.ts';
import { targetState } from './relation-scopes.ts';
import { lockRevisionResources } from './revision-data.ts';
import { historicalLocale } from '../fields/remap-locale.ts';
import { remapReferencePath } from '../fields/remap-reference-path.ts';
import { collectReferences } from '../fields/collect-references.ts';
import { projectData } from '../fields/policies.ts';
import { saveInTransaction } from './save-document.ts';

export function uploadSettings(
  runtime: ContentRuntime,
  collection: ContentState['collection'],
): UploadSettings {
  if (!collection.upload) fail('invalid_input');
  return {
    mimeTypes: collection.upload.mimeTypes,
    maxBytes: runtime.uploadPolicy.maxBytes,
    recipe: {
      variants: collection.upload.variants.map((variant) => ({
        ...variant,
        quality: runtime.uploadPolicy.variantQuality,
        format: runtime.uploadPolicy.variantFormat,
      })),
    },
  };
}

export async function mediaState(
  tx: SqlExecutor,
  input: {
    runtime: ContentRuntime;
    actor: ActorReference;
    operationId: string;
    collectionKey: string;
    mode?: 'editing' | 'published';
    evaluatePolicy?: boolean;
  },
): Promise<ContentState> {
  const actor = await input.runtime.authorizeActor(tx, {
    actor: input.actor,
    operationId: input.operationId,
    scope: { scopeKind: 'collection', collectionKey: input.collectionKey },
  });
  const collection = input.runtime.registry.get(input.collectionKey);
  const state = {
    tx,
    actor,
    collection,
    ctx: { requestId: randomUUID(), ip: 'internal' },
    operationId: input.operationId,
    locale: resolveLocale(collection),
    mode: input.mode ?? 'editing',
    actorAuthorization: true,
  };
  const predicate = input.evaluatePolicy === false ? undefined : collectionPredicate(state);
  return { ...state, ...(predicate ? { predicate } : {}) };
}

async function bindingReadState(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    request: ContentAuthorizationInput;
    binding?: { sourcePath: string };
    schemaVersion: number;
  },
): Promise<ContentState> {
  const separator = input.binding?.sourcePath.indexOf(':') ?? -1;
  const sourceLocale =
    input.binding && separator >= 0 ? input.binding.sourcePath.slice(0, separator) : undefined;
  const locale =
    sourceLocale === undefined
      ? state.locale
      : state.collection.locales.supported.find(
          (candidate) =>
            historicalLocale({
              current: state.collection,
              schemaVersion: input.schemaVersion,
              locale: candidate,
            }) === sourceLocale,
        );
  if (locale === undefined) fail('not_found');
  const localized = { ...state, locale: resolveLocale(state.collection, locale) };
  const predicate = collectionPredicate(localized);
  const reader = { ...localized, ...(predicate ? { predicate } : {}) };
  if (!input.request.documentId) fail('not_found');
  await ensureVisible(reader, { runtime: input.runtime, id: input.request.documentId });
  await assetOperationPolicy(reader, input);
  return reader;
}

async function downloadBinding(
  state: ContentState,
  input: { runtime: ContentRuntime; request: ContentAuthorizationInput; versionId: string },
) {
  if (!input.runtime.assets) fail('temporarily_unavailable');
  const binding = input.request.bindingId
    ? await input.runtime.assets.resolveBinding(state.tx, {
        revisionId: input.versionId,
        bindingId: input.request.bindingId,
      })
    : undefined;
  if (binding && input.request.sourcePath && binding.sourcePath !== input.request.sourcePath)
    fail('not_found');
  return binding;
}

async function downloadSource(
  state: ContentState,
  input: { runtime: ContentRuntime; request: ContentAuthorizationInput },
) {
  if (!input.request.documentId || !input.runtime.assets) fail('not_found');
  const document = await input.runtime.store.readDocument(state.tx, {
    collection: state.collection.key,
    locale: state.locale,
    id: input.request.documentId,
  });
  const versionId =
    input.request.versionId ??
    (state.mode === 'published' ? document.publishedVersionId : document.currentVersionId);
  if (!versionId) fail('not_found');
  const version = await input.runtime.store.readRevision(state.tx, {
    collection: state.collection.key,
    documentId: document.id,
    versionId,
  });
  const binding = await downloadBinding(state, { ...input, versionId });
  const reader = await bindingReadState(state, {
    ...input,
    schemaVersion: version.schemaVersion,
    ...(binding ? { binding } : {}),
  });
  if (
    input.request.versionId &&
    versionId !== document.currentVersionId &&
    versionId !== document.publishedVersionId
  )
    await requireAdditionalOperation(reader, {
      runtime: input.runtime,
      operationId: 'versions.get',
      id: document.id,
    });
  if (binding && binding.sourcePath !== '$file')
    await assertReadableBinding(reader, {
      runtime: input.runtime,
      documentId: document.id,
      versionId,
      schemaVersion: version.schemaVersion,
      binding,
    });
  return { document, versionId, binding, state: reader };
}

async function downloadAuthorization(
  state: ContentState,
  input: { runtime: ContentRuntime; request: ContentAuthorizationInput },
) {
  const source = await downloadSource(state, input);
  const targetCollection = source.binding?.mediaCollectionKey ?? state.collection.key;
  const targetId = source.binding?.mediaDocumentId ?? source.document.id;
  const target = await targetState(
    { ...source.state, mode: 'editing' },
    { runtime: input.runtime, collection: targetCollection },
  );
  await ensureVisible(target, { runtime: input.runtime, id: targetId });
  await requireAdditionalOperation(target, {
    runtime: input.runtime,
    operationId: 'assets.download',
    id: targetId,
  });
  if (!input.runtime.assets) fail('temporarily_unavailable');
  const grant =
    source.binding?.authorizedManifest ??
    (await input.runtime.assets.resolveRevisionMedia(state.tx, {
      revisionId: source.versionId,
      sourcePath: '$file',
      mediaDocumentId: source.document.id,
    }));
  return {
    upload: uploadSettings(input.runtime, target.collection),
    documentId: source.document.id,
    revision: source.document.revision,
    revisionId: source.versionId,
    manifestId: grant.manifestId,
  };
}

async function assertReadableBinding(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    documentId: string;
    versionId: string;
    schemaVersion: number;
    binding: { sourcePath: string; mediaDocumentId: string; mediaCollectionKey: string };
  },
): Promise<void> {
  const separator = input.binding.sourcePath.indexOf(':');
  const { locale } = state;
  const rawPath =
    separator >= 0 ? input.binding.sourcePath.slice(separator + 1) : input.binding.sourcePath;
  const sourcePath = remapReferencePath({
    from: input.runtime.store.definition(state.collection.key, input.schemaVersion),
    to: state.collection,
    path: rawPath,
  });
  const data = await input.runtime.store.readRevisionData(state.tx, {
    collection: state.collection.key,
    documentId: input.documentId,
    versionId: input.versionId,
    locale,
    fallback: [],
  });
  const projected = projectData({
    collection: state.collection,
    data,
    context: policyContext({ ...state, locale }, data),
  });
  const references = collectReferences({
    limits: input.runtime.limits,
    collection: state.collection,
    data: projected,
    locale,
  });
  if (
    !references.some(
      (reference) =>
        reference.media &&
        reference.path === sourcePath &&
        reference.id === input.binding.mediaDocumentId &&
        reference.collection === input.binding.mediaCollectionKey,
    )
  )
    fail('not_found');
}

export function createMediaAuthorizer(runtime: ContentRuntime): ContentAuthorizer {
  return async function authorizeContent(tx: SqlExecutor, request: ContentAuthorizationInput) {
    const executor = budgetedExecutor(tx, runtime.limits.maxSqlQueries);
    if (request.action !== 'download') await lockContentMutation(executor, runtime);
    const operationId = mediaOperation(request.action);
    const state = await mediaState(executor, {
      runtime,
      actor: actorReference(request.actor),
      operationId,
      collectionKey: request.collectionKey,
      ...(request.mode ? { mode: request.mode } : {}),
      ...(request.action === 'download' ? { evaluatePolicy: false } : {}),
    });
    if (request.action === 'download') return downloadAuthorization(state, { runtime, request });
    await assetOperationPolicy(state, { runtime, request });
    return mutationAuthorization(state, { runtime, request });
  };
}

async function mutationAuthorization(
  state: ContentState,
  input: { runtime: ContentRuntime; request: ContentAuthorizationInput },
) {
  const upload = uploadSettings(input.runtime, state.collection);
  if (input.request.action === 'upload') return { upload };
  if (
    !input.request.documentId ||
    (!input.request.reauthorizeOnly && input.request.revision === undefined)
  )
    fail('invalid_input');
  const document = await ensureVisible(state, {
    runtime: input.runtime,
    id: input.request.documentId,
  });
  if (!input.request.reauthorizeOnly && input.request.revision !== undefined)
    requireRevision(document, input.request.revision);
  const locked = await lockRevisionResources(state, {
    runtime: input.runtime,
    document,
    revision: input.request.reauthorizeOnly
      ? document.revision
      : (input.request.revision ?? document.revision),
  });
  const grant =
    input.request.action === 'reprocess' && input.runtime.assets
      ? await input.runtime.assets.resolveRevisionMedia(state.tx, {
          revisionId: locked.currentVersionId,
          sourcePath: '$file',
          mediaDocumentId: locked.id,
        })
      : undefined;
  return {
    upload,
    documentId: locked.id,
    revision: locked.revision,
    revisionId: locked.currentVersionId,
    ...(grant ? { manifestId: grant.manifestId } : {}),
  };
}

export function createProcessingCommitter(runtime: ContentRuntime) {
  return async function commitProcessing(
    tx: SqlExecutor,
    input: {
      actor: ContentState['actor'];
      collectionKey: string;
      documentId: string;
      revision: number;
      uploadId: string;
      jobId: string;
    },
  ): Promise<{ revisionId: string }> {
    await lockContentMutation(tx, runtime);
    const state = await mediaState(tx, {
      runtime,
      actor: actorReference(input.actor),
      operationId: 'documents.update',
      collectionKey: input.collectionKey,
    });
    const result = await saveInTransaction(state, {
      runtime,
      values: {
        collection: input.collectionKey,
        id: input.documentId,
        revision: input.revision,
        uploadId: input.uploadId,
      },
      kind: 'fileProcessed',
    });
    return { revisionId: result.versionId };
  };
}

function mediaOperation(action: ContentAuthorizationInput['action']): string {
  if (action === 'download') return 'documents.get';
  return action === 'upload' ? 'documents.create' : 'documents.update';
}

async function assetOperationPolicy(
  state: ContentState,
  input: { runtime: ContentRuntime; request: ContentAuthorizationInput },
): Promise<void> {
  const { operationId } = input.request;
  if (input.request.documentId) {
    await requireAdditionalOperation(state, {
      runtime: input.runtime,
      operationId,
      id: input.request.documentId,
    });
    return;
  }
  const actor = await input.runtime.authorizeActor(state.tx, {
    actor: actorReference(state.actor),
    operationId,
    scope: { scopeKind: 'collection', collectionKey: state.collection.key },
  });
  const predicate = collectionPredicate({ ...state, actor, operationId });
  if (predicate) fail('forbidden');
}
