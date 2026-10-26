import type { Context } from 'hono';
import type { AssetDownload } from '@new-cms/cms/assets';
import type { HttpEnvironment } from './contract.ts';
import { previewHeaders } from './public-content-input.ts';

export function matchesEtag(header: string | undefined, etag: string): boolean {
  return (
    header
      ?.split(',')
      .some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag) ?? false
  );
}

function selectedRange(header: string, bytes: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || bytes === 0) return null;
  const first = match[1] ? Number(match[1]) : Math.max(0, bytes - Number(match[2]));
  const last = match[1] && match[2] ? Math.min(Number(match[2]), bytes - 1) : bytes - 1;
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    first > last ||
    first >= bytes ||
    (Number(match[2]) === 0 && !match[1])
  )
    return null;
  return { start: first, end: last };
}

function rangeStream(
  source: ReadableStream<Uint8Array>,
  range: { start: number; end: number },
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let offset = 0;
  let finished = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!finished) {
          const result = await reader.read();
          if (result.done) throw new Error('Media stream ended before its declared range');
          const start = offset;
          offset += result.value.byteLength;
          if (offset <= range.start) continue;
          controller.enqueue(
            result.value.subarray(
              Math.max(0, range.start - start),
              Math.min(result.value.byteLength, range.end - start + 1),
            ),
          );
          if (offset > range.end) {
            finished = true;
            await reader.cancel();
            reader.releaseLock();
            controller.close();
          }
          return;
        }
      } catch (error) {
        if (!finished) {
          finished = true;
          await reader.cancel(error).catch(() => {});
          reader.releaseLock();
          controller.error(error);
        }
      }
    },
    async cancel(reason) {
      if (!finished) {
        finished = true;
        await reader.cancel(reason);
        reader.releaseLock();
      }
    },
  });
}

function downloadHeaders(file: AssetDownload, preview: boolean): Headers {
  const headers = new Headers(
    preview ? previewHeaders() : { 'cache-control': 'public, max-age=0, must-revalidate' },
  );
  headers.set('content-type', file.mimeType);
  headers.set('content-length', String(file.bytes));
  headers.set('etag', `"${file.digest}"`);
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cross-origin-resource-policy', preview ? 'same-origin' : 'cross-origin');
  const disposition = /^(image|audio|video)\//.test(file.mimeType) ? 'inline' : 'attachment';
  headers.set(
    'content-disposition',
    `${disposition}; filename="download"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
  );
  return headers;
}

export async function publicMediaResponse(
  context: Context<HttpEnvironment>,
  file: AssetDownload,
  preview: boolean,
): Promise<Response> {
  const headers = downloadHeaders(file, preview);
  if (!preview && matchesEtag(context.req.header('if-none-match'), `"${file.digest}"`)) {
    await file.stream.cancel();
    headers.delete('content-length');
    return new Response(null, { status: 304, headers });
  }
  const rangeHeader = context.req.header('range');
  const ifRange = context.req.header('if-range');
  const range =
    rangeHeader && (!ifRange || ifRange === `"${file.digest}"`)
      ? selectedRange(rangeHeader, file.bytes)
      : undefined;
  if (range === null) {
    await file.stream.cancel();
    headers.set('content-range', `bytes */${file.bytes}`);
    headers.delete('content-length');
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${file.bytes}`);
    headers.set('content-length', String(range.end - range.start + 1));
  }
  if (context.req.method === 'HEAD') {
    await file.stream.cancel();
    return new Response(null, { status: range ? 206 : 200, headers });
  }
  context.set('streaming', true);
  return new Response(range ? rangeStream(file.stream, range) : file.stream, {
    status: range ? 206 : 200,
    headers,
  });
}
