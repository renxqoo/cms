import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { downloadFilename, downloadResponse } from '../download';
import { downloadResponseSchema } from '../../contracts/download';
import { apiResponse } from '../result';
import { readResponseBytes } from '../read-body';

describe('private byte response decoding', () => {
  it('preserves exact binary bytes and safe metadata without interpreting them as JSON', async () => {
    const bytes = new Uint8Array([0, 128, 255, 10]);
    const result = await downloadResponse(
      new Response(bytes, {
        headers: {
          'content-type': 'IMAGE/PNG; charset=binary',
          'content-disposition': "attachment; filename*=UTF-8''%E5%9B%BE%E7%89%87.png",
          etag: '"private-version"',
          'x-request-id': 'download-request',
        },
      }),
      downloadResponseSchema,
    );
    expect(result).toMatchObject({
      ok: true,
      status: 200,
      requestId: 'download-request',
      data: {
        bytes: 4,
        contentType: 'image/png',
        filename: '图片.png',
        etag: '"private-version"',
      },
    });
    if (!result.ok) throw new Error('Expected private bytes');
    expect(Array.from(new Uint8Array(await result.data.blob.arrayBuffer()))).toEqual([
      0, 128, 255, 10,
    ]);
    expect(result.data.blob.type).toBe('image/png');
  });

  it('retains authorization and Retry-After errors as structured failures', async () => {
    const result = await downloadResponse(
      Response.json(
        {
          error: {
            code: 'forbidden',
            message: 'Access denied.',
            requestId: 'denied-request',
          },
        },
        { status: 403, headers: { 'retry-after': '12' } },
      ),
      downloadResponseSchema,
    );
    expect(result).toMatchObject({
      ok: false,
      status: 403,
      uncertain: false,
      retryAfterSeconds: 12,
      error: {
        code: 'forbidden',
        requestId: 'denied-request',
      },
    });
  });

  it('cancels a declared oversized response before reading its body', async () => {
    const cancel = vi.fn<() => void>();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { 'content-length': '33554433' },
    });
    expect(await downloadResponse(response, downloadResponseSchema)).toMatchObject({
      ok: false,
      error: { code: 'invalid_response' },
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('enforces actual byte size when Content-Length is absent and cancels the source', async () => {
    const cancel = vi.fn<() => void>();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
        },
        cancel,
      }),
    );
    await expect(readResponseBytes(response, 2)).rejects.toThrow('Invalid response size');
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it('releases a failed reader without swallowing cancellation', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new DOMException('Cancelled', 'AbortError'));
        },
      }),
    );
    await expect(downloadResponse(response, downloadResponseSchema)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(response.body?.locked).toBe(false);
  });

  it('supports an empty file and neutral MIME fallback without invented metadata', async () => {
    const result = await downloadResponse(
      new Response(null, { headers: { 'content-type': 'invalid' } }),
      downloadResponseSchema,
    );
    expect(result).toMatchObject({
      ok: true,
      data: { bytes: 0, filename: null, etag: null, contentType: 'application/octet-stream' },
    });
    expect(
      await downloadResponse(new Response('bytes'), z.object({ wrong: z.literal(true) })),
    ).toMatchObject({ ok: false, error: { code: 'invalid_response' } });
  });

  it.each(['-1', 'NaN', '99999999999999999999999'])(
    'rejects malformed or oversized Content-Length %s',
    async (length) => {
      expect(
        await downloadResponse(
          new Response('bytes', { headers: { 'content-length': length } }),
          downloadResponseSchema,
        ),
      ).toMatchObject({ ok: false, error: { code: 'invalid_response' } });
    },
  );

  it('applies the JSON response budget to gateway failures and preserves uncertain writes', async () => {
    const response = new Response('x'.repeat(2 * 1024 * 1024 + 1), { status: 502 });
    expect(await apiResponse(response, z.unknown(), true)).toMatchObject({
      ok: false,
      status: 502,
      uncertain: true,
      error: { code: 'invalid_response' },
    });
  });
});

it.each([
  [null, null],
  ['inline', null],
  ['attachment; filename="../report.pdf"', 'report.pdf'],
  ['attachment; filename="a<b>.pdf"', 'a_b_.pdf'],
  ['attachment; filename=".."', null],
  ["attachment; filename*=UTF-8''a%2Fb.png", 'b.png'],
  ["attachment; filename*=UTF-8''%ZZ", null],
  ['attachment; filename= image.png ', 'image.png'],
  [`attachment; filename=${'x'.repeat(250)}`, 'x'.repeat(200)],
])('normalizes a download filename from %j', (header, expected) => {
  expect(downloadFilename(header)).toBe(expected);
});
