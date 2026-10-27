import { afterEach, expect, it, vi } from 'vitest';
import type { ServerResponse } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { collectionOGImage } from '../collection-og-image';
import { httpFixture, principal, sendJson } from './support';

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => [{ name: 'oneaster-session', value: 'valid-token' }],
    }),
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('redirect');
  },
  notFound: () => {
    throw new Error('not-found');
  },
}));

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!complete) throw new Error('Missing promise resolver');
      complete(value);
    },
  };
}

afterEach(() => vi.unstubAllEnvs());

it('regression: cancelling a private image closes the pending session request before rendering', async () => {
  const started = deferred<void>();
  const cancelled = deferred<boolean>();
  const paths: string[] = [];
  let held: ServerResponse | undefined;
  const fixture = await httpFixture((request, response) => {
    paths.push(request.url ?? '');
    held = response;
    response.once('close', () => cancelled.resolve(!response.writableEnded));
    started.resolve();
  });
  vi.stubEnv('CMS_API_BASE_URL', fixture.origin);
  vi.stubEnv('CMS_ADMIN_ORIGIN', 'http://localhost:3000');
  const controller = new AbortController();
  const pending = collectionOGImage({ collection: 'articles', signal: controller.signal });
  const timeout = new AbortController();
  let closed = false;
  try {
    await started.promise;
    controller.abort();
    closed = await Promise.race([
      cancelled.promise,
      setTimeout(1000, false, { signal: timeout.signal }).catch(() => false),
    ]);
  } finally {
    timeout.abort();
    if (held && !held.writableEnded) sendJson(held, principal);
    await pending;
    await fixture.close();
  }
  expect(closed).toBe(true);
  const response = await pending;
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(paths).toEqual(['/v1/me']);
});
