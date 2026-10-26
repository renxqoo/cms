import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import type { UploadSession } from '../../../contracts/assets';
import { readEditor } from '../read-editor';
import type { EditorSnapshot } from '../read-editor';
import { snapshot, id } from './support';
const controls = vi.hoisted(() => ({
  request:
    vi.fn<
      (input: {
        operation: string;
        query?: Readonly<Record<string, unknown>>;
        params?: Readonly<Record<string, string>>;
      }) => Promise<ApiResult<unknown>>
    >(),
}));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
afterEach(() => vi.resetAllMocks());
function ok(data: unknown): ApiResult<unknown> {
  return { ok: true, status: 200, requestId: 'request', data };
}
function dataFor(
  operation: string,
  value: EditorSnapshot,
  document: unknown = value.document,
): unknown {
  if (operation === 'collections.get') return value.collection;
  if (operation === 'collections.editor') return value.editor;
  return document;
}
function setup() {
  const value = snapshot();
  controls.request.mockImplementation((input) =>
    Promise.resolve(ok(dataFor(input.operation, value))),
  );
  return value;
}
function readInput() {
  return {
    collection: 'articles',
    id,
    intent: 'update' as const,
    signal: new AbortController().signal,
  };
}
it('regression: update metadata omits fallback and depth while the document read explicitly disables fallback and expansion', async () => {
  const value = setup();
  value.editor.locale = 'zh-CN';
  value.editor.fallback = ['en'];
  const result = await readEditor({ ...readInput(), locale: 'zh-CN' });
  expect(result.ok).toBe(true);
  expect(controls.request.mock.calls[1]?.[0].query).toEqual({
    intent: 'update',
    mode: 'editing',
    id,
    locale: 'zh-CN',
  });
  expect(controls.request.mock.calls[2]?.[0].query).toEqual({
    locale: 'zh-CN',
    fallback: [],
    depth: 0,
    mode: 'editing',
  });
});
it('requests read metadata with an explicit empty fallback and refuses an unsupported locale before any document request', async () => {
  const value = setup();
  value.editor.intent = 'read';
  await readEditor({ ...readInput(), intent: 'read' });
  expect(controls.request.mock.calls[1]?.[0].query).toEqual({
    intent: 'read',
    mode: 'editing',
    id,
    fallback: [],
  });
  controls.request.mockClear();
  const result = await readEditor({ ...readInput(), locale: 'invalid' });
  expect(result).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
  expect(controls.request).toHaveBeenCalledOnce();
});
it('retries the complete metadata and document pair once after an interleaved revision change', async () => {
  const value = setup();
  let reads = 0;
  controls.request.mockImplementation((request) => {
    if (request.operation === 'documents.get') reads += 1;
    const document = reads === 1 ? { ...value.document, revision: 4 } : value.document;
    return Promise.resolve(ok(dataFor(request.operation, value, document)));
  });
  const result = await readEditor(readInput());
  expect(result.ok).toBe(true);
  expect(controls.request).toHaveBeenCalledTimes(6);
});
it('keeps a persistent mapping mismatch unwritable after one bounded retry', async () => {
  const value = setup();
  controls.request.mockImplementation((request) =>
    Promise.resolve(
      ok(
        request.operation === 'collections.get'
          ? { ...value.collection, mappingFingerprint: 'changed' }
          : dataFor(request.operation, value),
      ),
    ),
  );
  const result = await readEditor(readInput());
  expect(result).toMatchObject({ ok: false, status: 409, error: { code: 'version_conflict' } });
  expect(controls.request).toHaveBeenCalledTimes(6);
});
it('create metadata has no ID and creates no document read', async () => {
  const value = setup();
  value.editor = { ...value.editor, intent: 'create', document: null };
  const result = await readEditor({
    collection: 'articles',
    intent: 'create',
    signal: new AbortController().signal,
  });
  expect(result.ok).toBe(true);
  expect(controls.request).toHaveBeenCalledTimes(2);
  expect(controls.request.mock.calls[1]?.[0].query).toEqual({ intent: 'create', mode: 'editing' });
});
it('regression: metadata for a different language is rejected without reading that language document', async () => {
  setup();
  const result = await readEditor({ ...readInput(), locale: 'zh-CN' });
  expect(result).toMatchObject({ ok: false, status: 409 });
  expect(
    controls.request.mock.calls.filter(([request]) => request.operation === 'documents.get'),
  ).toHaveLength(0);
  expect(
    controls.request.mock.calls.filter(([request]) => request.operation === 'collections.editor'),
  ).toHaveLength(2);
});
it.each(['id', 'intent', 'mode', 'fallback', 'collection'] as const)(
  'rejects metadata with a different request %s before any document read',
  async (kind) => {
    const value = setup();
    if (kind === 'id' && value.editor.document)
      value.editor.document.id = '10000000-0000-4000-8000-000000000002';
    if (kind === 'intent') value.editor.intent = 'read';
    if (kind === 'mode') value.editor.mode = 'published';
    if (kind === 'fallback') value.editor.fallback = ['zh-CN'];
    if (kind === 'collection') value.editor.collection = 'other';
    expect(await readEditor(readInput())).toMatchObject({ ok: false, status: 409 });
    expect(
      controls.request.mock.calls.some(([request]) => request.operation === 'documents.get'),
    ).toBe(false);
  },
);
it.each(['collections.get', 'collections.editor', 'documents.get'])(
  'preserves a real %s read failure without loading later dependencies',
  async (operation) => {
    const value = setup();
    controls.request.mockImplementation((request) =>
      Promise.resolve(
        request.operation === operation
          ? failure('backend_unavailable', 503)
          : ok(dataFor(request.operation, value)),
      ),
    );
    expect(await readEditor(readInput())).toMatchObject({ ok: false, status: 503 });
    expect(controls.request.mock.calls.at(-1)?.[0].operation).toBe(operation);
  },
);
it('does not continue a bounded mismatch retry after cancellation', async () => {
  const value = setup();
  value.editor.locale = 'zh-CN';
  const controller = new AbortController();
  controller.abort();
  expect(await readEditor({ ...readInput(), signal: controller.signal })).toMatchObject({
    ok: false,
    error: { code: 'request_cancelled' },
  });
  expect(controls.request).toHaveBeenCalledTimes(2);
});
function upload(): UploadSession {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    collection: 'articles',
    purpose: 'create',
    documentId: null,
    revision: null,
    status: 'ready',
    filename: 'image.png',
    declaredMimeType: 'image/png',
    declaredBytes: 100,
    createdAt: '2026-10-26T00:00:00.000Z',
    expiresAt: '2030-01-01T00:00:00.000Z',
    failureCode: null,
    jobId: null,
    manifest: {
      id: '40000000-0000-4000-8000-000000000001',
      filename: 'image.png',
      mimeType: 'image/png',
      bytes: 100,
      digest: 'digest',
      width: 10,
      height: 10,
      orientation: 1,
      processorVersion: 'test',
      recipe: { variants: [] },
      objects: [],
    },
  };
}
function setupUpload(session: UploadSession) {
  const value = setup();
  value.collection.upload = true;
  value.editor = { ...value.editor, intent: 'create', document: null };
  controls.request.mockImplementation((request) =>
    Promise.resolve(
      ok(request.operation === 'assets.readUpload' ? session : dataFor(request.operation, value)),
    ),
  );
  return value;
}
it('reads and retains a ready upload for the correct new-document collection without claiming attachment', async () => {
  const session = upload();
  setupUpload(session);
  const result = await readEditor({
    collection: 'articles',
    intent: 'create',
    uploadId: session.id,
    signal: new AbortController().signal,
  });
  expect(result).toMatchObject({
    ok: true,
    data: { document: null, upload: { id: session.id, status: 'ready' } },
  });
  expect(controls.request.mock.calls.at(-1)?.[0]).toMatchObject({
    operation: 'assets.readUpload',
    params: { collection: 'articles', uploadId: session.id },
  });
});
it.each([
  'collection',
  'purpose',
  'status',
  'expiry',
  'document',
  'revision',
  'manifest',
  'disabledUpload',
] as const)('refuses a new upload with mismatched %s', async (kind) => {
  const session = upload();
  if (kind === 'collection') session.collection = 'media';
  if (kind === 'purpose') session.purpose = 'replace';
  if (kind === 'status') session.status = 'consumed';
  if (kind === 'expiry') session.expiresAt = '2020-01-01T00:00:00.000Z';
  if (kind === 'document') session.documentId = id;
  if (kind === 'revision') session.revision = 1;
  if (kind === 'manifest') session.manifest = null;
  const value = setupUpload(session);
  if (kind === 'disabledUpload') value.collection.upload = false;
  expect(
    await readEditor({
      collection: 'articles',
      intent: 'create',
      uploadId: session.id,
      signal: new AbortController().signal,
    }),
  ).toMatchObject({ ok: false, status: 409, error: { code: 'invalid_input' } });
});

it('regression: write metadata may describe its configured locale fallback while document editing still reads no translated fallback', async () => {
  const value = setup();
  value.editor.locale = 'zh-CN';
  value.editor.fallback = ['en'];
  if (value.document) value.document.data = { title: null, slug: 'original' };
  const result = await readEditor({ ...readInput(), locale: 'zh-CN' });
  expect(result).toMatchObject({
    ok: true,
    data: { editor: { locale: 'zh-CN', fallback: ['en'] }, document: { data: { title: null } } },
  });
  expect(controls.request.mock.calls.at(-1)?.[0].query).toMatchObject({
    locale: 'zh-CN',
    fallback: [],
    depth: 0,
  });
});

it('accepts a supported locale whose name is an inherited object property without treating that property as a fallback chain', async () => {
  const value = setup();
  value.collection.locales = ['constructor'];
  value.editor.locale = 'constructor';
  value.editor.locales = { default: 'constructor', supported: ['constructor'], fallback: {} };
  expect(await readEditor({ ...readInput(), locale: 'constructor' })).toMatchObject({ ok: true });
});
