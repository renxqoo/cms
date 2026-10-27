import { createServer } from 'node:http';
import type { RequestListener, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { metadataCollection, metadataDocument } from './admin-metadata-data.ts';
const principal = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 1,
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
  email: 'metadata@example.test',
  displayName: 'Metadata verifier',
  roleId: '22222222-2222-4222-8222-222222222222',
  roleCode: 'super',
  status: 'active',
  activation: 'activated',
  lastLoginAt: null,
  role: {
    id: '22222222-2222-4222-8222-222222222222',
    code: 'super',
    name: 'Super',
    status: 'active',
    isSuper: true,
  },
};
function send(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Request-Id': 'metadata-transport',
  });
  response.end(JSON.stringify(value));
}
interface TransportState {
  imageMode: 'dynamic' | 'static' | 'off';
  hidden: boolean;
  requests: { path: string; locale: string | null; actor: string }[];
}
function collection(state: TransportState) {
  return {
    ...metadataCollection,
    admin: {
      ...metadataCollection.admin,
      hidden: state.hidden,
      meta: {
        titleSuffix: ' — 管理',
        defaultOGImageType: state.imageMode,
        robots: { index: false },
        viewport: 'width=device-width,initial-scale=1',
        themeColor: '#ffffff',
        openGraph: { type: 'article' },
      },
    },
  };
}
function handler(state: TransportState): RequestListener {
  return (request, response) => {
    const url = new URL(request.url ?? '/', 'http://metadata.test');
    const actor = request.headers.authorization?.replace('Bearer ', '') ?? '';
    state.requests.push({ path: url.pathname, locale: url.searchParams.get('locale'), actor });
    if (!['metadata-first', 'metadata-second', 'metadata-denied'].includes(actor))
      return send(
        response,
        {
          error: {
            code: 'unauthenticated',
            message: 'Unavailable',
            requestId: 'metadata-transport',
          },
        },
        401,
      );
    if (url.pathname === '/v1/me') return send(response, principal);
    if (url.pathname === '/v1/collections/articles') return send(response, collection(state));
    if (
      url.pathname === `/v1/collections/articles/documents/${metadataDocument.id}` &&
      actor !== 'metadata-denied'
    )
      return send(response, {
        ...metadataDocument,
        data: {
          title: actor === 'metadata-first' ? 'First actor document' : 'Second actor document',
        },
      });
    return send(
      response,
      { error: { code: 'forbidden', message: 'Unavailable', requestId: 'metadata-transport' } },
      403,
    );
  };
}
export async function createMetadataTransport() {
  const state: TransportState = { imageMode: 'dynamic', hidden: false, requests: [] };
  const server = createServer(handler(state));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing transport address');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests: state.requests,
    setMode(mode: TransportState['imageMode']) {
      state.imageMode = mode;
    },
    setHidden(value: boolean) {
      state.hidden = value;
    },
    async close() {
      const closed = once(server, 'close');
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}
