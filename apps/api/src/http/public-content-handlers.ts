import { createHash } from 'node:crypto';
import type { ContentDeliveryApi, PublicEnvelope } from '@new-cms/cms/content/delivery';
import type { Context } from 'hono';
import type { BusinessHandler } from './handlers.ts';
import type { StreamingHandler } from './operation-handlers.ts';
import type { HttpEnvironment } from './contract.ts';
import {
  publicInput,
  previewGrant,
  previewHeaders,
  assertEmptyBody,
} from './public-content-input.ts';
import { matchesEtag, publicMediaResponse } from './public-media-response.ts';
import { publicExportResponse } from './public-content-export.ts';

function publicJson(context: Context<HttpEnvironment>, value: PublicEnvelope<unknown>): Response {
  const body = JSON.stringify(value);
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=0, must-revalidate',
    'content-length': String(Buffer.byteLength(body)),
    etag,
  };
  if (matchesEtag(context.req.header('if-none-match'), etag))
    return new Response(null, { status: 304, headers });
  return new Response(context.req.method === 'HEAD' ? null : body, { headers });
}

export function previewTicketHandlers(delivery: ContentDeliveryApi): Map<string, BusinessHandler> {
  return new Map<string, BusinessHandler>([
    ['documents.createPreviewTicket', delivery.createPreviewTicket.bind(delivery)],
    ['documents.revokePreviewTicket', delivery.revokePreviewTicket.bind(delivery)],
  ]);
}

function previewModel(delivery: ContentDeliveryApi, integrations = false): StreamingHandler {
  return async (context) => {
    const query = publicInput(
      context,
      integrations ? 'previewContent.integrations' : 'previewContent.model',
    );
    const input = { ...query, grant: previewGrant(context) };
    const value = integrations
      ? await delivery.getPreviewIntegrations(input, context.get('signal'))
      : await delivery.getPreviewModel(input, context.get('signal'));
    return new Response(context.req.method === 'HEAD' ? null : JSON.stringify(value.content), {
      headers: {
        ...previewHeaders(),
        'content-type': 'application/json; charset=utf-8',
        'x-preview-expires-at': value.expiresAt,
      },
    });
  };
}

function revokePreview(delivery: ContentDeliveryApi): StreamingHandler {
  return async (context) => {
    publicInput(context, 'previewContent.revoke');
    await assertEmptyBody(context);
    const value = await delivery.revokePreview(
      { grant: previewGrant(context) },
      context.get('signal'),
    );
    return new Response(JSON.stringify({ success: true, data: value }), {
      headers: { ...previewHeaders(), 'content-type': 'application/json; charset=utf-8' },
    });
  };
}

function jsonHandler(
  id: string,
  call: (input: Record<string, string>, signal: AbortSignal) => Promise<PublicEnvelope<unknown>>,
): StreamingHandler {
  return async (context) =>
    publicJson(context, await call(publicInput(context, id), context.get('signal')));
}

function mediaHandler(delivery: ContentDeliveryApi, preview: boolean): StreamingHandler {
  return async (context) => {
    const input = publicInput(context, preview ? 'previewContent.media' : 'publicContent.media');
    const signal = context.get('signal');
    const file = preview
      ? await delivery.getPreviewMedia({ ...input, grant: previewGrant(context) }, signal)
      : await delivery.getPublicMedia(input, signal);
    return publicMediaResponse(context, file, preview);
  };
}

export function publicContentHandlers(delivery: ContentDeliveryApi): Map<string, StreamingHandler> {
  const json = [
    ['publicContent.interface', delivery.getInterface.bind(delivery)],
    ['publicContent.home', delivery.getHome.bind(delivery)],
    ['publicContent.models', delivery.listModels.bind(delivery)],
    ['publicContent.model', delivery.getModel.bind(delivery)],
    ['publicContent.integrations', delivery.getIntegrations.bind(delivery)],
    ['publicContent.documents', delivery.getDocuments.bind(delivery)],
    ['publicContent.document', delivery.getDocuments.bind(delivery)],
  ] as const;
  return new Map<string, StreamingHandler>([
    ...json.map(([id, call]) => [id, jsonHandler(id, call)] as [string, StreamingHandler]),
    ['publicContent.index', (context) => publicExportResponse(context, delivery, false)],
    ['publicContent.sitemap', (context) => publicExportResponse(context, delivery, true)],
    ['publicContent.media', mediaHandler(delivery, false)],
    ['previewContent.integrations', previewModel(delivery, true)],
    ['previewContent.model', previewModel(delivery)],
    ['previewContent.media', mediaHandler(delivery, true)],
    ['previewContent.revoke', revokePreview(delivery)],
  ]);
}
