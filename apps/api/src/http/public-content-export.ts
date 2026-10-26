import { CmsError } from '@new-cms/cms/platform/contracts';
import type { ContentDeliveryApi } from '@new-cms/cms/content/delivery';
import type { Context } from 'hono';
import type { HttpEnvironment } from './contract.ts';
import { publicInput } from './public-content-input.ts';

function exportStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  first: Uint8Array,
  cancel: AbortController,
) {
  let initial: Uint8Array | undefined = first;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (initial) {
          controller.enqueue(initial);
          initial = undefined;
          return;
        }
        const next = await reader.read();
        if (next.done) {
          reader.releaseLock();
          controller.close();
        } else controller.enqueue(next.value);
      } catch (error) {
        cancel.abort(error);
        controller.error(error);
      }
    },
    async cancel(reason) {
      cancel.abort(reason);
      await reader.cancel(reason);
      reader.releaseLock();
    },
  });
}

export async function publicExportResponse(
  context: Context<HttpEnvironment>,
  delivery: ContentDeliveryApi,
  sitemap: boolean,
): Promise<Response> {
  const operationId = sitemap ? 'publicContent.sitemap' : 'publicContent.index';
  const input = publicInput(context, operationId);
  const cancelled = new AbortController();
  const signal = AbortSignal.any([context.get('signal'), cancelled.signal]);
  const channel = new TransformStream<Uint8Array, Uint8Array>();
  const reader = channel.readable.getReader();
  const writer = channel.writable.getWriter();
  const task = delivery.exportContent(
    { ...input, kind: sitemap ? 'sitemap' : input['kind'] },
    (frame) => writer.write(frame),
    signal,
  );
  void task
    .then(
      () => writer.close(),
      (error: unknown) => writer.abort(error),
    )
    .catch(() => {});
  let first: Awaited<ReturnType<typeof reader.read>>;
  try {
    first = await reader.read();
  } catch (error) {
    cancelled.abort(error);
    reader.releaseLock();
    throw error;
  }
  if (first.done) throw new CmsError('temporarily_unavailable');
  const headers = {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
  };
  if (context.req.method === 'HEAD') {
    cancelled.abort();
    await reader.cancel();
    reader.releaseLock();
    return new Response(null, { headers });
  }
  context.set('streaming', true);
  return new Response(exportStream(reader, first.value, cancelled), { headers });
}
