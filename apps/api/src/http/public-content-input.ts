import type { Context } from 'hono';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { HttpEnvironment } from './contract.ts';
import { publicContentInputSchemas } from '../config/public-content-operations.ts';

export function publicInput(
  context: Context<HttpEnvironment>,
  operationId: string,
): Record<string, string> {
  const input = new Map<string, string>();
  for (const [key, value] of new URL(context.req.url).searchParams.entries()) {
    if (input.has(key)) throw new CmsError('invalid_input');
    input.set(key, value);
  }
  for (const [key, value] of Object.entries(context.req.param())) {
    if (input.has(key)) throw new CmsError('invalid_input');
    input.set(key, value);
  }
  const result = Object.fromEntries(input);
  const schema = publicContentInputSchemas[operationId];
  if (!schema?.safeParse(result).success) throw new CmsError('invalid_input');
  return result;
}

export function previewGrant(context: Context<HttpEnvironment>): string {
  const authorization = context.req.header('authorization');
  if (!authorization || !/^Bearer [A-Za-z0-9_-]+$/.test(authorization))
    throw new CmsError('unauthenticated');
  return authorization.slice(7);
}

export function previewHeaders(): Record<string, string> {
  return {
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
  };
}
export async function assertEmptyBody(context: Context<HttpEnvironment>): Promise<void> {
  const reader = context.req.raw.body?.getReader();
  if (!reader) return;
  const signal = context.get('signal');
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) return;
      if (next.value.byteLength > 0) throw new CmsError('invalid_input');
    }
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
