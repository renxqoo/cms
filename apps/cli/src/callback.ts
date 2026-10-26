import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CliConfig } from './config.ts';

interface CallbackOptions {
  limits: CliConfig['callbackLimits'];
  state: string;
  issuer: string;
  timeoutMs: number;
  signal: AbortSignal;
}

function callbackCode(request: IncomingMessage, options: CallbackOptions): string {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method !== 'GET' || url.pathname !== '/callback')
    throw new Error('Invalid OAuth callback');
  for (const key of ['state', 'code', 'iss', 'error']) {
    if (url.searchParams.getAll(key).length > 1)
      throw new Error('Duplicate OAuth callback parameter');
  }
  if (
    url.searchParams.get('state') !== options.state ||
    url.searchParams.get('iss') !== options.issuer
  )
    throw new Error('OAuth callback state or issuer mismatch');
  if (url.searchParams.has('error')) throw new Error('Authorization was denied');
  const code = url.searchParams.get('code');
  if (!code || code.length > options.limits.codeCharacters)
    throw new Error('Invalid OAuth authorization code');
  return code;
}

export async function openCallback(options: CallbackOptions) {
  const { promise: result, resolve: accept, reject: fail } = Promise.withResolvers<string>();
  const server = createServer({ maxHeaderSize: options.limits.headerBytes }, (request, response) =>
    receive(request, response),
  );
  function receive(request: IncomingMessage, response: ServerResponse) {
    if ((request.url ?? '').length > options.limits.urlCharacters) {
      response.writeHead(414).end();
      return;
    }
    if (request.url?.startsWith('/favicon.ico')) {
      response.writeHead(404).end();
      return;
    }
    try {
      const code = callbackCode(request, options);
      response
        .writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' })
        .end('Authorization received. You can close this window.');
      accept(code);
    } catch (error) {
      response
        .writeHead(400, { 'content-type': 'text/plain' })
        .end('Authorization callback rejected.');
      fail(error instanceof Error ? error : new Error('Invalid OAuth callback'));
    }
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('OAuth callback has no TCP address');
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;
  const timer = setTimeout(() => fail(new Error('Authorization timed out')), options.timeoutMs);
  const abort = () => fail(new Error('Authorization cancelled'));
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();
  function close() {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', abort);
    server.closeAllConnections();
    server.close();
  }
  const settled = result.finally(close);
  void settled.catch(() => {});
  return { result: settled, redirectUri, close };
}
