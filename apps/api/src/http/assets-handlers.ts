import { CmsError } from '@new-cms/cms/platform/contracts';
import type { ContentUploadsApi } from '@new-cms/cms/content';
import { requestContext, routeInput } from './contract.ts';
import type { BusinessHandler } from './handlers.ts';
import type { StreamingHandler } from './operation-handlers.ts';

export function assetHandlers(assets: ContentUploadsApi): Map<string, BusinessHandler> {
  return new Map<string, BusinessHandler>([
    ['assets.createUpload', assets.createUpload],
    ['assets.completeUpload', assets.completeUpload],
    ['assets.readUpload', assets.readUpload],
    ['assets.cancelUpload', assets.cancelUpload],
    ['assets.reprocess', assets.reprocess],
  ]);
}

function disposition(filename: string): string {
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="download"; filename*=UTF-8''${encoded}`;
}

export function assetStreamHandlers(
  assets: ContentUploadsApi,
  maxBody: number,
): Map<string, StreamingHandler> {
  const download: StreamingHandler = async (context) => {
    const file = await assets.download(requestContext(context), await routeInput(context, maxBody));
    const headers = {
      'content-type': file.mimeType,
      'content-length': String(file.bytes),
      'content-disposition': disposition(file.filename),
      etag: `"${file.digest}"`,
      'cache-control': 'private, no-store',
    };
    if (context.req.method === 'HEAD') {
      await file.stream.cancel();
      return new Response(null, { headers });
    }
    context.set('streaming', true);
    return new Response(file.stream, { headers });
  };
  const upload: StreamingHandler = async (context) => {
    if (Object.keys(context.req.queries()).length > 0) throw new CmsError('invalid_input');
    const type = context.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
    const encoding = context.req.header('content-encoding');
    if (type !== 'application/octet-stream' || (encoding !== undefined && encoding !== 'identity'))
      throw new CmsError('unsupported_media_type');
    const stream = context.req.raw.body;
    if (!stream) throw new CmsError('invalid_input');
    const value = await assets.writeUpload(requestContext(context), context.req.param(), stream);
    return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  };
  return new Map([
    ['assets.writeUpload', upload],
    ['assets.download', download],
    ['assets.downloadBinding', download],
  ]);
}
