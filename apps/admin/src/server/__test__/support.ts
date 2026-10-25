import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';

export const principal = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 1,
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
  email: 'admin@example.com',
  displayName: 'Administrator',
  roleId: '22222222-2222-4222-8222-222222222222',
  roleCode: 'super',
  status: 'active',
  activation: 'activated',
  lastLoginAt: null,
  role: {
    id: '22222222-2222-4222-8222-222222222222',
    code: 'super',
    name: 'Super administrator',
    status: 'active',
    isSuper: true,
  },
};

export async function httpFixture(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
) {
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      const closed = new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      server.closeAllConnections();
      await closed;
    },
  };
}

export async function incomingBody(request: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of request) body += String(chunk);
  return body;
}

export function sendJson(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'x-request-id': 'request-123',
    'x-private-internal': 'secret',
  });
  response.end(JSON.stringify(value));
}

export function sendError(response: ServerResponse, code: string, status: number) {
  sendJson(
    response,
    {
      error: {
        code,
        message: 'A safe upstream error',
        requestId: 'request-123',
        fieldErrors: [{ field: 'email', message: 'Invalid input' }],
      },
      internal: 'secret',
    },
    status,
  );
}
