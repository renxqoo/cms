import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { createRunner, ensureVisible, parse, requireAdditionalOperation } from '../runtime.ts';
import { projectDocument } from '../documents/project-document.ts';
import type { ContentRuntime } from '../types.ts';
import { documentPreviewSchema } from './contracts.ts';

function trustedUrl(raw: string | null, origins: readonly string[]): URL {
  if (raw === null) fail('not_found');
  if (typeof raw !== 'string') fail('invalid_input');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail('invalid_input');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !origins.includes(url.origin)
  )
    fail('invalid_input');
  return url;
}
function getDocumentPreview(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.preview'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.preview',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      const configuration = state.collection.preview;
      if (!configuration) fail('not_found');
      await requireAdditionalOperation(state, {
        runtime,
        operationId: 'collections.editor',
        id: input.id,
      });
      const reader = await requireAdditionalOperation(state, {
        runtime,
        operationId: 'documents.get',
        id: input.id,
      });
      const document = await ensureVisible(reader, { runtime, id: input.id });
      const view = await projectDocument(reader, { runtime, document, fallback: [] });
      const url = trustedUrl(
        configuration.url.run({
          collection: state.collection.key,
          id: document.id,
          locale: state.locale,
          data: view.data,
        }),
        configuration.origins,
      );
      return documentPreviewSchema.parse({
        url: url.toString(),
        origin: url.origin,
        live: state.collection.livePreview === true,
        devices: configuration.devices,
      });
    },
  );
}
export function createPreviewApi(runtime: ContentRuntime) {
  return {
    getDocumentPreview: (ctx: RequestContext, raw: unknown) =>
      getDocumentPreview(runtime, ctx, raw),
  };
}
