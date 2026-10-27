import { beforeEach, expect, it, vi } from 'vitest';
import { requestApi } from '../../../api/client';
import { failure } from '../../../api/result';
import { readBulkEditor, bulkEditorLayout } from '../bulk-read';
import { catalog, document, documentId, editor, folderId, success, versionId } from './support';

vi.mock('../../../api/client', () => ({ requestApi: vi.fn<typeof requestApi>() }));
const request = vi.mocked(requestApi);
beforeEach(() => request.mockReset());
function input(documents = [document()]) {
  return { collection: catalog(), documents, locale: 'en', signal: new AbortController().signal };
}

it('omits bulk-disabled descendants from groups, tabs and blocks while retaining ordinary editing descriptors', () => {
  const [field] = editor().layout;
  if (!field) throw new Error('Missing field');
  const omitted = {
    ...field,
    id: 'private',
    name: 'private',
    disabled: { field: false, column: false, filter: false, bulkEdit: true },
  };
  const layout = [
    { ...field, id: 'group', type: 'group' as const, children: [field, omitted] },
    {
      ...field,
      id: 'tabs',
      type: 'tabs' as const,
      tabs: [{ id: 'tab', label: 'Tab', children: [omitted, field] }],
    },
    {
      ...field,
      id: 'blocks',
      type: 'blocks' as const,
      blocks: [{ id: 'block', key: 'hero', label: 'Hero', children: [omitted, field] }],
    },
    omitted,
  ];
  const filtered = bulkEditorLayout(layout);
  expect(filtered).toHaveLength(3);
  expect(filtered[0]?.children).toEqual([field]);
  expect(filtered[1]?.tabs?.[0]?.children).toEqual([field]);
  expect(filtered[2]?.blocks?.[0]?.children).toEqual([field]);
  expect(layout[0]?.children).toHaveLength(2);
});

it('reads at most ten explicitly selected update descriptors in sequence with no fallback or depth', async () => {
  request
    .mockResolvedValueOnce(success(editor()))
    .mockResolvedValueOnce(
      success(editor({ document: { id: folderId, revision: 1, versionId, trashedAt: null } })),
    );
  expect((await readBulkEditor(input([document(), document({ id: folderId })]))).ok).toBe(true);
  expect(request.mock.calls.map(([value]) => value.query)).toEqual([
    { intent: 'update', id: documentId, locale: 'en', mode: 'editing' },
    { intent: 'update', id: folderId, locale: 'en', mode: 'editing' },
  ]);
});

it('rejects empty or oversized bulk updates before consuming metadata budget', async () => {
  expect((await readBulkEditor(input([]))).ok).toBe(false);
  expect((await readBulkEditor(input(Array.from({ length: 11 }, () => document())))).ok).toBe(
    false,
  );
  expect(request).not.toHaveBeenCalled();
});

it.each([
  editor({ document: { id: documentId, revision: 2, versionId, trashedAt: null } }),
  editor({ mappingFingerprint: 'other' }),
  editor({ behaviorHash: 'other' }),
  editor({ schemaVersion: 2 }),
  editor({ intent: 'copy' }),
  editor({ locale: 'zh-CN' }),
  editor({ mode: 'published' }),
  editor({ actions: [{ operationId: 'documents.update', state: 'denied' }] }),
])(
  'rejects a selected record whose current descriptor no longer matches the selected revision or authorization',
  async (metadata) => {
    request.mockResolvedValue(success(metadata));
    expect((await readBulkEditor(input())).ok).toBe(false);
  },
);

it('rejects different safe field projections rather than copying first-record visibility', async () => {
  request.mockResolvedValueOnce(success(editor())).mockResolvedValueOnce(
    success(
      editor({
        document: { id: folderId, revision: 1, versionId, trashedAt: null },
        layout: [],
      }),
    ),
  );
  expect((await readBulkEditor(input([document(), document({ id: folderId })]))).ok).toBe(false);
});

it('keeps an actual metadata denial and stops without reading further selected records', async () => {
  request.mockResolvedValueOnce(failure('forbidden', 403));
  expect(await readBulkEditor(input([document(), document({ id: folderId })]))).toMatchObject({
    ok: false,
    status: 403,
  });
  expect(request).toHaveBeenCalledOnce();
});
