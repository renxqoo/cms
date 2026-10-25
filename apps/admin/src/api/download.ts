import type { z } from 'zod';
import { apiResponse, failure } from './result';
import type { ApiResult } from './result';
import { requestPolicy } from './config';
import { readResponseBytes } from './read-body';

export function downloadFilename(disposition: string | null): string | null {
  if (disposition === null) return null;
  const extended = /(?:^|;)\s*filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /(?:^|;)\s*filename=(?:"([^"]*)"|([^;]*))/i.exec(disposition);
  let value = plain?.[1] ?? plain?.[2] ?? '';
  if (extended) {
    try {
      value = decodeURIComponent(extended.trim());
    } catch {
      return null;
    }
  }
  const name = value
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f<>:"|?*\u2028\u2029]/g, '_')
    .trim();
  return name && !/^\.+$/.test(name) ? [...name].slice(0, 200).join('') : null;
}

export async function downloadResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<ApiResult<T>> {
  if (!response.ok) return apiResponse(response, schema, false);
  const requestId = response.headers.get('x-request-id') ?? '';
  let chunks: Uint8Array<ArrayBuffer>[];
  try {
    chunks = await readResponseBytes(response, requestPolicy.byteLimit);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return failure('invalid_response', response.status, { requestId });
  }
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const contentType =
    mime && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)
      ? mime
      : 'application/octet-stream';
  const blob = new Blob(chunks, { type: contentType });
  const parsed = schema.safeParse({
    blob,
    bytes: blob.size,
    filename: downloadFilename(response.headers.get('content-disposition')),
    contentType,
    etag: response.headers.get('etag'),
  });
  return parsed.success
    ? { ok: true, status: response.status, data: parsed.data, requestId }
    : failure('invalid_response', response.status, { requestId });
}
