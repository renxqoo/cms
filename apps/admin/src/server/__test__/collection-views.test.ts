import { beforeEach, expect, it, vi } from 'vitest';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { readRegisteredView } from '../collection-views';
const state = vi.hoisted(() => ({
  cookies: [] as { name: string; value: string }[],
  request:
    vi.fn<
      (input: {
        operation: string;
        params?: Record<string, string>;
        token: string;
        response: unknown;
      }) => Promise<ApiResult<unknown>>
    >(),
  session: vi.fn<() => Promise<void>>(),
}));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ getAll: () => state.cookies }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));
vi.mock('../require-session', () => ({ requireSession: state.session }));
vi.mock('../api', () => ({ requestBackend: state.request }));
const view = {
  id: 'report',
  scope: 'document',
  path: 'report/summary',
  label: 'Report',
  component: 'site/report',
};
beforeEach(() => {
  state.cookies = [{ name: 'oneaster-session', value: 'verified-session' }];
  state.session.mockReset();
  state.session.mockResolvedValue();
  state.request.mockReset();
  state.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'collections.get'
        ? {
            ok: true,
            status: 200,
            requestId: 'request',
            data: { admin: { views: [view, { ...view, id: 'list', scope: 'collection' }] } },
          }
        : { ok: true, status: 200, requestId: 'request', data: { id: 'authorized' } },
    ),
  );
});
it('custom document view metadata requires both collection discovery and an authorized document read', async () => {
  expect(
    await readRegisteredView('articles', 'document:report/summary', { documentId: 'document-id' }),
  ).toEqual(view);
  expect(state.session).toHaveBeenCalledTimes(1);
  expect(
    state.request.mock.calls.map(([input]) => ({
      operation: input.operation,
      params: input.params,
      token: input.token,
    })),
  ).toEqual([
    { operation: 'collections.get', params: { collection: 'articles' }, token: 'verified-session' },
    {
      operation: 'documents.get',
      params: { collection: 'articles', id: 'document-id' },
      token: 'verified-session',
    },
  ]);
});
it('collection views only need authorized collection metadata and preserve explicit scope', async () => {
  expect(await readRegisteredView('articles', 'collection:report/summary')).toMatchObject({
    id: 'list',
    scope: 'collection',
  });
  expect(state.request.mock.calls.map(([input]) => input.operation)).toEqual(['collections.get']);
});
it('missing, malformed or duplicate session cookies never request custom view metadata', async () => {
  for (const cookies of [
    [],
    [{ name: 'oneaster-session', value: '%20' }],
    [
      { name: 'oneaster-session', value: 'one' },
      { name: 'oneaster-session', value: 'two' },
    ],
  ]) {
    state.cookies = cookies;
    await expect(
      readRegisteredView('articles', 'document:report/summary', { documentId: 'document-id' }),
    ).rejects.toThrow('not-found');
  }
  expect(state.request).not.toHaveBeenCalled();
});
it('missing views, missing document ids and denied document reads are unavailable rather than exposing view metadata', async () => {
  await expect(
    readRegisteredView('articles', 'document:missing', { documentId: 'document-id' }),
  ).rejects.toThrow('not-found');
  await expect(readRegisteredView('articles', 'document:report/summary')).rejects.toThrow(
    'not-found',
  );
  state.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'collections.get'
        ? { ok: true, status: 200, requestId: 'request', data: { admin: { views: [view] } } }
        : failure('forbidden', 403),
    ),
  );
  await expect(
    readRegisteredView('articles', 'document:report/summary', { documentId: 'document-id' }),
  ).rejects.toThrow('not-found');
  state.request.mockResolvedValue(failure('forbidden', 403));
  await expect(
    readRegisteredView('articles', 'document:report/summary', { documentId: 'document-id' }),
  ).rejects.toThrow('not-found');
});
