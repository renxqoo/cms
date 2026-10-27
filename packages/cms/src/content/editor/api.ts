import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { createRunner, parse } from '../runtime.ts';
import { uploadSettings } from '../documents/media-authorization.ts';
import { fieldPaths } from '../fields/structure.ts';
import { generateCollectionSchema } from '../fields/data-schema.ts';
import { editorInputSchema } from './input.ts';
import { editorContext } from './context.ts';
import { editorPresentation } from './presentation.ts';
import { previewEditor } from './preview.ts';
import { editorComponentVersions } from './component-versions.ts';
import { editorLayout } from './layout.ts';
import { editorActions, editorQueryableFields } from './actions.ts';
import { collectionEditorSchema } from './contracts.ts';
import type { ContentRuntime } from '../types.ts';
import type { EditorContext } from './context.ts';
import type { CollectionEditor } from './contracts.ts';
import { requireAdminVisible } from '../collections/admin-visibility.ts';

function editorUpload(context: EditorContext, runtime: ContentRuntime) {
  if (!context.state.collection.upload) return null;
  return {
    ...uploadSettings(runtime, context.state.collection),
    filesRequiredOnCreate: context.state.collection.upload.filesRequiredOnCreate !== false,
    ...runtime.uploadPolicy.imageLimits,
    directUpload: false,
    multipart: false,
  };
}

async function describeEditor(
  context: EditorContext,
  runtime: ContentRuntime,
): Promise<CollectionEditor> {
  const { state, document, versionId } = context;
  const projection = await editorLayout(context, await editorQueryableFields(context, runtime));
  return collectionEditorSchema.parse({
    collection: state.collection.key,
    schemaVersion: state.collection.schemaVersion,
    behaviorHash: runtime.registry.behaviorHash,
    mappingFingerprint: runtime.mapping.get(state.collection.key).fingerprint,
    ...(state.collection.publicationLocalesField
      ? { publicationLocalesField: state.collection.publicationLocalesField }
      : {}),
    intent: context.input.intent,
    mode: state.mode,
    locale: state.locale,
    fallback: context.fallback,
    richTextNodes: fieldPaths(projection.read).some(({ field }) => field.type === 'richText')
      ? (state.collection.richTextNodes ?? []).map(({ type, version }) => ({ type, version }))
      : [],
    document: document
      ? { id: document.id, revision: document.revision, versionId, trashedAt: document.trashedAt }
      : null,
    locales: state.collection.locales,
    layout: projection.layout,
    componentVersions: editorComponentVersions(runtime, state.collection, projection.layout),
    ...(await editorPresentation(context, {
      runtime,
      fields: projection.read,
      layout: projection.layout,
    })),
    schemas: {
      read: generateCollectionSchema({ ...state.collection, fields: projection.read }, 'read'),
      draft: generateCollectionSchema({ ...state.collection, fields: projection.write }, 'draft'),
      commit: generateCollectionSchema(
        { ...state.collection, fields: projection.write },
        'published',
      ),
    },
    actions: await editorActions(context, runtime),
    collaboration:
      state.collection.lockDocuments === false ? null : (state.collection.lockDocuments ?? null),
    preview: state.collection.preview !== undefined && document !== null,
    upload: editorUpload(context, runtime),
  });
}

async function getEditor(
  runtime: ContentRuntime,
  ctx: RequestContext,
  raw: unknown,
): Promise<CollectionEditor> {
  const input = parse(editorInputSchema(runtime.limits.maxLocales), raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'collections.editor',
      collection: input.collection,
      mode: input.mode,
      ...(input.locale ? { locale: input.locale } : {}),
      ...('fallback' in input && input.fallback ? { fallbackOverride: input.fallback } : {}),
    },
    async (state) => {
      await requireAdminVisible(state);
      return describeEditor(await editorContext(state, { runtime, values: input }), runtime);
    },
  );
}

export function createEditorApi(runtime: ContentRuntime) {
  return {
    getEditor: (ctx: RequestContext, raw: unknown) => getEditor(runtime, ctx, raw),
    previewEditor: (ctx: RequestContext, raw: unknown) => previewEditor(runtime, ctx, raw),
  };
}
