import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import type { AuthorizedManifest } from '@new-cms/cms/assets/composition';
import type { ContentRuntime, ContentState } from '../types.ts';
import { historicalLocale } from '../fields/remap-locale.ts';
import { remapReferencePath } from '../fields/remap-reference-path.ts';
import { fieldPaths } from '../fields/structure.ts';
import { requireAdditionalOperation } from '../runtime.ts';
import type { ReferenceValue } from '../definition.ts';

interface BindInput {
  runtime: ContentRuntime;
  documentId: string;
  revisionId: string;
  expectedRevision?: number;
  uploadId?: string;
  previous?: { documentId: string; revisionId: string };
  references: readonly ReferenceValue[];
  requireSourceRead?: boolean;
  previousSchemaVersion?: number;
}

async function inheritedManifest(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    revisionId: string;
    sourcePath: string;
    mediaDocumentId: string;
    schemaVersion?: number;
    fieldId?: string;
  },
): Promise<AuthorizedManifest | undefined> {
  if (!input.runtime.assets) return undefined;
  try {
    const sourcePath = priorReferencePath(state, input);
    if (!sourcePath) return undefined;
    return await input.runtime.assets.resolveRevisionMedia(state.tx, {
      revisionId: input.revisionId,
      mediaDocumentId: input.mediaDocumentId,
      sourcePath,
    });
  } catch (error) {
    if (error instanceof CmsError && error.code === 'not_found') return undefined;
    throw error;
  }
}

async function bindOwnFile(state: ContentState, input: BindInput): Promise<void> {
  const { assets } = input.runtime;
  if (!state.collection.upload) {
    if (input.uploadId) fail('invalid_input');
    return;
  }
  if (!assets) fail('temporarily_unavailable');
  if (input.requireSourceRead && input.previous)
    await requireAdditionalOperation(state, {
      runtime: input.runtime,
      operationId: 'assets.download',
      id: input.previous.documentId,
    });
  const old = input.previous
    ? await inheritedManifest(state, {
        runtime: input.runtime,
        revisionId: input.previous.revisionId,
        sourcePath: '$file',
        mediaDocumentId: input.previous.documentId,
      })
    : undefined;
  if (!input.uploadId && !old) fail('invalid_input');
  await assets.bind(state.tx, {
    actorId: state.actor.id,
    collectionKey: state.collection.key,
    documentId: input.documentId,
    revisionId: input.revisionId,
    sourcePath: '$file',
    ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
    ...(input.uploadId ? { uploadId: input.uploadId } : {}),
    ...(!input.uploadId && old ? { authorizedManifest: old } : {}),
  });
}

async function bindMediaReference(
  state: ContentState,
  input: BindInput,
  reference: ReferenceValue,
): Promise<void> {
  const { assets } = input.runtime;
  if (!assets) fail('temporarily_unavailable');
  let manifest = input.previous
    ? await inheritedManifest(state, {
        runtime: input.runtime,
        revisionId: input.previous.revisionId,
        sourcePath: reference.path,
        mediaDocumentId: reference.id,
        ...(input.previousSchemaVersion === undefined
          ? {}
          : { schemaVersion: input.previousSchemaVersion }),
        fieldId: reference.fieldId,
      })
    : undefined;
  if (!manifest) {
    const target = await input.runtime.store.readDocument(state.tx, {
      collection: reference.collection,
      id: reference.id,
    });
    const revisionId =
      state.mode === 'published' ? target.publishedVersionId : target.currentVersionId;
    if (!revisionId) fail('not_found');
    manifest = await assets.resolveRevisionMedia(state.tx, {
      revisionId,
      sourcePath: '$file',
      mediaDocumentId: reference.id,
    });
  }
  await assets.bind(state.tx, {
    actorId: state.actor.id,
    collectionKey: state.collection.key,
    documentId: input.documentId,
    revisionId: input.revisionId,
    sourcePath: reference.path,
    authorizedManifest: manifest,
  });
}

export async function bindRevisionAssets(state: ContentState, input: BindInput): Promise<void> {
  const source = input.previous
    ? await input.runtime.store.readRevision(state.tx, {
        collection: state.collection.key,
        documentId: input.previous.documentId,
        versionId: input.previous.revisionId,
      })
    : undefined;
  const contextual = {
    ...input,
    ...(source ? { previousSchemaVersion: source.schemaVersion } : {}),
  };
  await bindOwnFile(state, contextual);
  for (const reference of input.references) {
    if (reference.media) await bindMediaReference(state, contextual, reference);
  }
}

function priorReferencePath(
  state: ContentState,
  input: { runtime: ContentRuntime; sourcePath: string; schemaVersion?: number; fieldId?: string },
): string | undefined {
  if (
    input.sourcePath === '$file' ||
    input.schemaVersion === undefined ||
    input.schemaVersion === state.collection.schemaVersion
  )
    return input.sourcePath;
  const old = input.runtime.store.definition(state.collection.key, input.schemaVersion);
  if (input.fieldId && !fieldPaths(old.fields).some(({ field }) => field.id === input.fieldId))
    return undefined;
  const separator = input.sourcePath.indexOf(':');
  const currentLocale = separator >= 0 ? input.sourcePath.slice(0, separator) : state.locale;
  const locale = historicalLocale({
    current: state.collection,
    schemaVersion: input.schemaVersion,
    locale: currentLocale,
  });
  if (locale === null) return undefined;
  const path = separator >= 0 ? input.sourcePath.slice(separator + 1) : input.sourcePath;
  const prior = remapReferencePath({
    from: state.collection,
    to: old,
    path,
    ...(input.fieldId ? { fieldId: input.fieldId } : {}),
  });
  return `${locale}:${prior}`;
}
