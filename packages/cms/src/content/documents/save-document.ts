import type { DocumentRow } from '../model.ts';
import { projectDocument } from '../documents/project-document.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { createRunner, ensureVisible, idempotentReference, parse } from '../runtime.ts';
import { lockRevisionResources, writeInput } from './revision-data.ts';
import { inputPatches, prepareLocaleWrite, readLocaleData } from './prepare-write.ts';
import { writeRevision } from './write-revision.ts';
import { pruneDocumentVersions } from '../versions/retention.ts';
import type { RevisionMediaSources } from './bind-assets.ts';
import type { ContentRuntime, ContentState, ContentWriteInput } from '../types.ts';

export async function saveInTransaction(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    values: ContentWriteInput;
    kind: string;
    mediaSources?: RevisionMediaSources;
    filename?: string;
  },
): Promise<{ id: string; versionId: string }> {
  const current = await ensureVisible(state, { runtime: input.runtime, id: input.values.id });
  const currentLocales = await readLocaleData(state, { runtime: input.runtime, document: current });
  const prepared = await prepareLocaleWrite(state, {
    runtime: input.runtime,
    current: currentLocales,
    documentId: current.id,
    patches: inputPatches(state, input.values),
  });
  const document = await lockRevisionResources(state, {
    runtime: input.runtime,
    document: current,
    revision: input.values.revision,
    references: prepared.references,
  });
  const fileManifest =
    input.filename === undefined
      ? undefined
      : await renamedFile(state, { runtime: input.runtime, document, filename: input.filename });
  const reference = await writeRevision(state, {
    runtime: input.runtime,
    documentId: document.id,
    data: prepared.dataByLocale[state.locale] ?? {},
    dataByLocale: prepared.dataByLocale,
    previous: document,
    kind: input.kind,
    ...(fileManifest ? { fileManifest } : {}),
    ...(input.mediaSources ? { mediaSources: input.mediaSources } : {}),
    ...(input.values.uploadId ? { uploadId: input.values.uploadId } : {}),
    ...(input.values.folderId === undefined ? {} : { folderId: input.values.folderId }),
  });
  await pruneDocumentVersions(state, { runtime: input.runtime, documentId: document.id });
  return reference;
}

async function saveDocument(
  runtime: ContentRuntime,
  ctx: RequestContext,
  options: { raw: unknown; autosave: boolean },
) {
  const { raw, autosave } = options;
  const operationId = autosave ? 'documents.autosave' : 'documents.update';
  const schema = autosave
    ? runtime.schemas['documents.autosave']
    : runtime.schemas['documents.update'];
  const input = parse(schema, raw);
  const values = writeInput(input);
  return createRunner(runtime)(
    {
      ctx,
      operationId,
      collection: input.collection,
      ...(values.locale ? { locale: values.locale } : {}),
    },
    async (state) => {
      if (autosave && state.collection.mode !== 'drafts') fail('invalid_input');
      const work = () =>
        saveInTransaction(state, { runtime, values, kind: autosave ? 'autosave' : 'save' });
      const reference = autosave
        ? await idempotentReference(state, { runtime, input }, work)
        : await work();
      return projectDocument(state, {
        runtime,
        document: await ensureVisible(state, { runtime, id: reference.id }),
      });
    },
  );
}

export function createSaveDocumentApi(runtime: ContentRuntime) {
  return {
    updateDocument: (ctx: RequestContext, raw: unknown) =>
      saveDocument(runtime, ctx, { raw, autosave: false }),
    autosaveDocument: (ctx: RequestContext, raw: unknown) =>
      saveDocument(runtime, ctx, { raw, autosave: true }),
  };
}

async function renamedFile(
  state: ContentState,
  input: { runtime: ContentRuntime; document: DocumentRow; filename: string },
) {
  if (!state.collection.upload) fail('invalid_input');
  const { assets } = input.runtime;
  if (!assets) fail('temporarily_unavailable');
  const source = await assets.resolveRevisionMedia(state.tx, {
    revisionId: input.document.currentVersionId,
    sourcePath: '$file',
    mediaDocumentId: input.document.id,
  });
  return assets.renameManifest(state.tx, { source, filename: input.filename });
}
