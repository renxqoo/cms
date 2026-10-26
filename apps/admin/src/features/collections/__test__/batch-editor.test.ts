import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import type { Document } from '../../../contracts/content';
import type { CollectionEditor } from '../../../contracts/editor';
import { readBatchEditor } from '../batch-editor';
import { snapshot, id } from './support';
const controls = vi.hoisted(() => ({
  request:
    vi.fn<
      (input: {
        operation: string;
        query?: Readonly<Record<string, unknown>>;
        signal: AbortSignal;
      }) => Promise<ApiResult<unknown>>
    >(),
}));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
function selected(): Document[] {
  const doc = snapshot().document;
  if (!doc) throw new Error('Missing fixture');
  return [doc, { ...doc, id: '10000000-0000-4000-8000-000000000002', revision: 5 }];
}
function editor(document: Document): CollectionEditor {
  const result = snapshot().editor;
  return {
    ...result,
    document: {
      id: document.id,
      revision: document.revision,
      versionId: document.versionId,
      trashedAt: null,
    },
  };
}
function ok(data: unknown): ApiResult<unknown> {
  return { ok: true, status: 200, requestId: '', data };
}
beforeEach(() =>
  controls.request.mockImplementation((input) => {
    const document = selected().find((row) => row.id === input.query?.['id']);
    if (!document) throw new Error('Unexpected ID');
    return Promise.resolve(ok(editor(document)));
  }),
);
afterEach(() => vi.resetAllMocks());
function batchInput(documents = selected()) {
  return {
    collection: snapshot().collection,
    documents,
    locale: 'en',
    signal: new AbortController().signal,
  };
}
it('reads each selected ID with its own update intent and requires the complete same layout before editing', async () => {
  const result = await readBatchEditor(batchInput());
  expect(result.ok).toBe(true);
  expect(controls.request.mock.calls.map(([request]) => request.query)).toEqual([
    { intent: 'update', id, locale: 'en', mode: 'editing' },
    { intent: 'update', id: '10000000-0000-4000-8000-000000000002', locale: 'en', mode: 'editing' },
  ]);
});
it.each([0, 11])('rejects a %s item update before requesting any metadata', async (count) => {
  const [document] = selected();
  if (!document) throw new Error('Missing fixture');
  const result = await readBatchEditor(batchInput(Array.from({ length: count }, () => document)));
  expect(result).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
  expect(controls.request).not.toHaveBeenCalled();
});
it.each([
  'revision',
  'version',
  'schema',
  'mapping',
  'behavior',
  'locale',
  'collection',
  'intent',
  'trashed',
] as const)('rejects a selected record with mismatched metadata %s', async (kind) => {
  controls.request.mockImplementation((request) => {
    const document = selected().find((row) => row.id === request.query?.['id']);
    if (!document) throw new Error('Missing fixture');
    const value = editor(document);
    if (kind === 'revision' && value.document) value.document.revision += 1;
    if (kind === 'version' && value.document)
      value.document.versionId = '20000000-0000-4000-8000-000000000002';
    if (kind === 'schema') value.schemaVersion += 1;
    if (kind === 'mapping') value.mappingFingerprint = 'new';
    if (kind === 'behavior') value.behaviorHash = 'new';
    if (kind === 'locale') value.locale = 'zh-CN';
    if (kind === 'collection') value.collection = 'media';
    if (kind === 'intent') value.intent = 'read';
    if (kind === 'trashed' && value.document) value.document.trashedAt = '2026-10-26T01:00:00.000Z';
    return Promise.resolve(ok(value));
  });
  expect(await readBatchEditor(batchInput())).toMatchObject({ ok: false, status: 409 });
});
it('does not use the first item write layout for a second item with different dynamic field access', async () => {
  controls.request.mockImplementation((request) => {
    const document = selected().find((row) => row.id === request.query?.['id']);
    if (!document) throw new Error('Missing fixture');
    const value = editor(document);
    if (document.id !== id)
      value.layout = value.layout.map((node) => ({ ...node, write: 'denied' }));
    return Promise.resolve(ok(value));
  });
  expect(await readBatchEditor(batchInput())).toMatchObject({ ok: false, status: 403 });
});
it('rejects an unavailable update action and preserves a genuine metadata read failure', async () => {
  controls.request.mockResolvedValue(
    ok({ ...snapshot().editor, actions: [{ operationId: 'documents.update', state: 'denied' }] }),
  );
  expect(await readBatchEditor(batchInput())).toMatchObject({ ok: false, status: 403 });
  controls.request.mockResolvedValue(failure('backend_unavailable', 503));
  expect(await readBatchEditor(batchInput())).toMatchObject({ ok: false, status: 503 });
});
it('serializes metadata reads instead of opening requests for every selection at once', async () => {
  let resolve: ((result: ApiResult<unknown>) => void) | undefined;
  const rows = selected();
  const [first, second] = rows;
  if (!first || !second) throw new Error('Missing fixture');
  controls.request
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue(ok(editor(second)));
  const pending = readBatchEditor(batchInput(rows));
  expect(controls.request).toHaveBeenCalledOnce();
  resolve?.(ok(editor(first)));
  await pending;
  expect(controls.request).toHaveBeenCalledTimes(2);
});
