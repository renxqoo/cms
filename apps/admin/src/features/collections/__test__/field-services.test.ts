import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { referenceServices } from '../field-services';
import { cellValue, documentTitle, pathValue } from '../document-label';
import { folderListSchema, folderTreeSchema } from '../../../contracts/content';
import { snapshot, id, time } from './support';
const controls = vi.hoisted(() => ({
  request:
    vi.fn<
      (input: {
        operation: string;
        params?: unknown;
        query?: unknown;
        signal: AbortSignal;
      }) => Promise<ApiResult<unknown>>
    >(),
}));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
afterEach(() => vi.resetAllMocks());
it('reference search preserves the requested locale, page and literal query without fallback or trashed candidates', async () => {
  const value = snapshot();
  const report = vi.fn<(result: ApiResult<unknown>) => void>();
  controls.request.mockResolvedValue({
    ok: true,
    status: 200,
    requestId: 'refs',
    data: { rows: [value.document], total: 25, page: 2, pageSize: 20 },
  });
  const service = referenceServices([value.collection], () => true, report);
  const { signal } = new AbortController();
  const result = await service.searchReferences?.({
    collection: 'articles',
    collections: ['articles'],
    query: 'draft & title',
    page: 2,
    locale: 'zh-CN',
    signal,
  });
  expect(controls.request).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      operation: 'documents.list',
      params: { collection: 'articles' },
      query: {
        q: 'draft & title',
        page: 2,
        pageSize: 20,
        locale: 'zh-CN',
        fallback: [],
        depth: 0,
        mode: 'editing',
        trashed: false,
      },
      signal,
    }),
  );
  expect(result).toMatchObject({
    rows: [{ collection: 'articles', id, label: 'Original' }],
    total: 25,
    page: 2,
  });
  expect(report).toHaveBeenCalledOnce();
  expect(service.collections).toEqual([{ id: 'articles', label: 'Articles', upload: false }]);
});
it.each(['missing', 'unlisted', 'revoked'])(
  'reference search rejects a %s target before making a request',
  async (reason) => {
    const value = snapshot();
    const service = referenceServices(
      reason === 'missing' ? [] : [value.collection],
      () => reason !== 'revoked',
      vi.fn(),
    );
    await expect(
      service.searchReferences?.({
        collection: 'articles',
        collections: reason === 'unlisted' ? ['media'] : ['articles'],
        query: '',
        page: 1,
        locale: 'en',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Reference directory is unavailable');
    expect(controls.request).not.toHaveBeenCalled();
  },
);
it('reference directory failures are reported and never presented as an empty page', async () => {
  const report = vi.fn<(result: ApiResult<unknown>) => void>();
  const result = failure('forbidden', 403);
  controls.request.mockResolvedValue(result);
  const service = referenceServices([snapshot().collection], () => true, report);
  await expect(
    service.searchReferences?.({
      collection: 'articles',
      collections: ['articles'],
      query: '',
      page: 1,
      locale: 'en',
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow('Reference directory is unavailable');
  expect(report).toHaveBeenCalledExactlyOnceWith(result);
});
it('document labels use scalar configured text paths, with filename and id fallbacks when values are unavailable', () => {
  const value = snapshot();
  if (!value.document) throw new Error('Missing document');
  const collection = {
    ...value.collection,
    fields: [
      {
        ...value.collection.fields[0],
        id: 'nested',
        path: 'group.label',
        type: 'textarea' as const,
        label: 'Nested',
        required: false,
        localized: false,
        queryable: false,
      },
    ],
  };
  expect(
    documentTitle({ ...value.document, data: { group: { label: 'Nested title' } } }, collection),
  ).toBe('Nested title');
  expect(documentTitle({ ...value.document, data: { group: ['bad'] } }, collection)).toBe(id);
  expect(pathValue({ group: null }, 'group.label')).toBeUndefined();
  expect(pathValue({ group: 1 }, 'group.label')).toBeUndefined();
  expect(cellValue(false)).toBe('—');
  expect(cellValue(true)).toBe('✓');
  expect(cellValue(null)).toBe('—');
  const absent: undefined = void 0;
  expect(cellValue(absent)).toBe('—');
  expect(cellValue('Readable')).toBe('Readable');
  expect(cellValue({ count: 2 })).toBe('{"count":2}');
});
it('folder contracts retain nested tree children and strip unrelated internal fields at every level', () => {
  const folder = {
    id,
    name: 'Parent',
    parentId: null,
    version: 1,
    createdAt: time,
    updatedAt: time,
  };
  const child = {
    ...folder,
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Child',
    parentId: id,
    children: [],
    internal: 'secret',
  };
  expect(folderTreeSchema.parse({ ...folder, internal: 'secret', children: [child] })).toEqual({
    ...folder,
    children: [{ ...folder, id: child.id, name: 'Child', parentId: id, children: [] }],
  });
  expect(folderListSchema.parse({ rows: [{ ...folder, children: [] }] }).rows[0]?.name).toBe(
    'Parent',
  );
});
