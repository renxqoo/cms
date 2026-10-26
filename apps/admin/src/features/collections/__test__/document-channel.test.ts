import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import type { EditorSnapshot } from '../read-editor';
import { createDocumentChannel } from '../document-channel';
import { documentDirty } from '../channel-data';
import { snapshot, newSnapshot, id } from './support';
const controls = vi.hoisted(() => ({
  request:
    vi.fn<
      (input: {
        operation: string;
        body?: unknown;
        idempotencyKey?: string;
        signal: AbortSignal;
      }) => Promise<ApiResult<unknown>>
    >(),
}));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
const channels: ReturnType<typeof createDocumentChannel>[] = [];
afterEach(() => {
  channels.forEach((channel) => channel.dispose());
  channels.length = 0;
  vi.resetAllMocks();
  vi.useRealTimers();
});
function success(data: unknown): ApiResult<unknown> {
  return { ok: true, status: 200, requestId: '', data };
}
function setup(initial = snapshot()) {
  let latest = initial;
  const can = vi.fn<(operation: string) => boolean>(() => true);
  const report = vi.fn<(result: ApiResult<unknown>) => void>();
  const load = vi.fn<
    (_id: string | undefined, signal: AbortSignal) => Promise<ApiResult<EditorSnapshot>>
  >(() => Promise.resolve({ ok: true, status: 200, requestId: '', data: latest }));
  const created = vi.fn<(value: string) => void>();
  const archived = vi.fn<() => void>();
  const channel = createDocumentChannel({ initial, can, report, load, created, archived });
  channels.push(channel);
  return {
    channel,
    can,
    report,
    load,
    created,
    archived,
    setLatest(value: EditorSnapshot) {
      latest = value;
    },
  };
}
it('saves only the changed writable fields with the confirmed revision and explicit content locale', async () => {
  const test = setup();
  test.channel.edit({ title: 'Changed', slug: 'original' });
  test.setLatest(snapshot(4, 'Changed'));
  controls.request.mockResolvedValue(success(snapshot(4, 'Changed').document));
  await test.channel.execute({ kind: 'save' });
  expect(controls.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'documents.update',
    body: { revision: 3, locale: 'en', data: { title: 'Changed' } },
  });
  expect(documentDirty(test.channel.getSnapshot())).toBe(false);
  expect(test.channel.getSnapshot().snapshot.document?.revision).toBe(4);
});
it('regression: a late save response preserves later typing and uses the new confirmed revision for the next save', async () => {
  let resolve: ((value: ApiResult<unknown>) => void) | undefined;
  const test = setup();
  controls.request.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  test.channel.edit({ title: 'Submitted', slug: 'original' });
  const pending = test.channel.execute({ kind: 'save' });
  test.channel.edit({ title: 'Newer typing', slug: 'original' });
  await test.channel.execute({ kind: 'save' });
  expect(controls.request).toHaveBeenCalledOnce();
  test.setLatest(snapshot(4, 'Submitted'));
  resolve?.(success(snapshot(4, 'Submitted').document));
  await pending;
  expect(test.channel.getSnapshot().draft['title']).toBe('Newer typing');
  expect(documentDirty(test.channel.getSnapshot())).toBe(true);
  controls.request.mockResolvedValue(success(snapshot(5, 'Newer typing').document));
  test.setLatest(snapshot(5, 'Newer typing'));
  await test.channel.execute({ kind: 'save' });
  expect(controls.request.mock.calls[1]?.[0].body).toEqual({
    revision: 4,
    locale: 'en',
    data: { title: 'Newer typing' },
  });
});
it('preserves a conflicting draft until an explicit rebase after a complete private reread', async () => {
  const test = setup();
  controls.request.mockResolvedValue(failure('version_conflict', 409));
  test.channel.edit({ title: 'My draft', slug: 'original' });
  await test.channel.execute({ kind: 'save' });
  test.setLatest(snapshot(8, 'Remote'));
  await test.channel.inspect();
  await test.channel.execute({ kind: 'save' });
  expect(controls.request).toHaveBeenCalledOnce();
  expect(test.channel.getSnapshot().draft['title']).toBe('My draft');
  expect(test.channel.getSnapshot().snapshot.document?.revision).toBe(3);
  test.channel.rebase(false);
  expect(test.channel.getSnapshot().snapshot.document?.revision).toBe(8);
  expect(test.channel.getSnapshot().draft['title']).toBe('My draft');
});
it('replays a create only by explicit choice with the same intent and key after an unknown response', async () => {
  const test = setup(newSnapshot());
  controls.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(success(snapshot(1, 'New').document));
  test.channel.edit({ title: 'New', slug: 'new' });
  await test.channel.execute({ kind: 'save' });
  test.channel.edit({ title: 'Different' });
  await test.channel.execute({ kind: 'save' });
  expect(controls.request).toHaveBeenCalledOnce();
  test.setLatest(snapshot(1, 'New'));
  await test.channel.retry();
  expect(controls.request.mock.calls[1]?.[0].idempotencyKey).toBe(
    controls.request.mock.calls[0]?.[0].idempotencyKey,
  );
  expect(controls.request.mock.calls[1]?.[0].body).toEqual(
    controls.request.mock.calls[0]?.[0].body,
  );
  expect(test.created).toHaveBeenCalledExactlyOnceWith(id);
});
it('invalid field drafts block manual save, autosave and publish even when the last parsed value is valid', async () => {
  vi.useFakeTimers();
  const test = setup();
  test.channel.edit({ title: 'Changed', slug: 'original' });
  test.channel.validity('json', 'Invalid JSON');
  test.channel.setAutosave(true);
  await test.channel.execute({ kind: 'save' });
  await test.channel.execute({ kind: 'publish' });
  await vi.advanceTimersByTimeAsync(5000);
  expect(controls.request).not.toHaveBeenCalled();
});
it('autosave is opt in, uses one quiet-window timer and cannot overlap a manual write', async () => {
  vi.useFakeTimers();
  const test = setup();
  controls.request.mockImplementation(() => new Promise(() => {}));
  test.channel.edit({ title: 'First', slug: 'original' });
  await vi.advanceTimersByTimeAsync(5000);
  expect(controls.request).not.toHaveBeenCalled();
  test.channel.setAutosave(true);
  test.channel.edit({ title: 'Second', slug: 'original' });
  await vi.advanceTimersByTimeAsync(1000);
  test.channel.edit({ title: 'Latest', slug: 'original' });
  await vi.advanceTimersByTimeAsync(1500);
  expect(controls.request).toHaveBeenCalledOnce();
  expect(controls.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'documents.autosave',
    body: { revision: 3, data: { title: 'Latest' } },
  });
  await test.channel.execute({ kind: 'save' });
  test.channel.dispose();
  expect(controls.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it('keeps a confirmed write paused when metadata refresh fails and verifies without repeating the write', async () => {
  const test = setup();
  controls.request.mockResolvedValue(success(snapshot(4, 'Changed').document));
  test.load.mockResolvedValueOnce(failure('backend_unavailable', 503));
  test.channel.edit({ title: 'Changed', slug: 'original' });
  await test.channel.execute({ kind: 'save' });
  expect(test.channel.getSnapshot().phase).toBe('blocked');
  test.setLatest(snapshot(4, 'Changed'));
  await test.channel.inspect();
  expect(controls.request).toHaveBeenCalledOnce();
  expect(test.channel.getSnapshot().phase).toBe('idle');
});
it('holds the document channel across an asynchronous resource lifecycle until a successful refresh and explicit completion', async () => {
  const test = setup();
  const lease = test.channel.beginAsset('replace');
  expect(lease?.revision).toBe(3);
  test.channel.edit({ title: 'While processing', slug: 'original' });
  await test.channel.execute({ kind: 'save' });
  expect(controls.request).not.toHaveBeenCalled();
  controls.request.mockResolvedValue(success(snapshot(4).document));
  await lease?.consumeUpload('30000000-0000-4000-8000-000000000001', new AbortController().signal);
  expect(controls.request.mock.calls[0]?.[0].body).toEqual({
    revision: 3,
    uploadId: '30000000-0000-4000-8000-000000000001',
  });
  expect(test.channel.getSnapshot().phase).toBe('writing');
  test.setLatest(snapshot(4));
  await lease?.refresh(new AbortController().signal);
  expect(test.channel.getSnapshot().phase).toBe('writing');
  lease?.finish('confirmed');
  expect(test.channel.getSnapshot().phase).toBe('idle');
  expect(test.channel.getSnapshot().draft['title']).toBe('While processing');
  expect(lease?.signal.aborted).toBe(true);
});
it('refuses to release a resource lease as confirmed without a verified reread and blocks all later writes', async () => {
  const test = setup();
  const lease = test.channel.beginAsset('reprocess');
  lease?.finish('confirmed');
  expect(test.channel.getSnapshot().phase).toBe('blocked');
  await test.channel.execute({ kind: 'publish' });
  expect(controls.request).not.toHaveBeenCalled();
});
it('checks current read dependencies again before retrying an unknown intent', async () => {
  const test = setup(newSnapshot());
  controls.request.mockResolvedValue(failure('request_failed', 0, { uncertain: true }));
  test.channel.edit({ title: 'New' });
  await test.channel.execute({ kind: 'save' });
  test.can.mockImplementation((operation) => operation !== 'collections.editor');
  await test.channel.retry();
  expect(controls.request).toHaveBeenCalledOnce();
});

it('regression: a blocked asynchronous asset lease cannot be released by reading an unchanged document', async () => {
  const test = setup();
  const lease = test.channel.beginAsset('reprocess');
  lease?.finish('blocked');
  await test.channel.inspect();
  expect(test.load).not.toHaveBeenCalled();
  expect(test.channel.getSnapshot().phase).toBe('blocked');
  expect(lease?.signal.aborted).toBe(false);
});
it('regression: the original asset lease remains usable for explicit terminal verification after blocking', async () => {
  const test = setup();
  const lease = test.channel.beginAsset('reprocess');
  lease?.finish('blocked');
  test.setLatest(snapshot(4));
  const result = await lease?.refresh(new AbortController().signal);
  expect(result?.ok).toBe(true);
  expect(test.channel.getSnapshot().phase).toBe('blocked');
  lease?.finish('confirmed');
  expect(test.channel.getSnapshot().phase).toBe('idle');
  expect(test.channel.getSnapshot().snapshot.document?.revision).toBe(4);
  expect(lease?.signal.aborted).toBe(true);
});

it('regression: a late background read cannot roll a successfully confirmed document back to an older revision', async () => {
  const initial = snapshot();
  const test = setup(initial);
  test.channel.edit({ title: 'Confirmed latest', slug: 'original' });
  test.setLatest(snapshot(4, 'Confirmed latest'));
  controls.request.mockResolvedValue(success(snapshot(4, 'Confirmed latest').document));
  await test.channel.execute({ kind: 'save' });
  test.channel.observe(initial);
  expect(test.channel.getSnapshot().snapshot.document?.revision).toBe(4);
  expect(test.channel.getSnapshot().draft['title']).toBe('Confirmed latest');
});

it('regression: an unknown archive is verified through the trash list without an ordinary editor read of the archived document', async () => {
  const test = setup();
  const archived = { ...snapshot(4).document, trashedAt: '2026-10-26T01:00:00.000Z' };
  controls.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(success({ rows: [archived], total: 1, page: 1, pageSize: 1 }));
  await test.channel.execute({ kind: 'archive' });
  await test.channel.inspect();
  expect(test.archived).toHaveBeenCalledOnce();
  expect(test.load).not.toHaveBeenCalled();
  expect(controls.request.mock.calls[1]?.[0]).toMatchObject({ operation: 'documents.list' });
  expect(test.channel.getSnapshot().snapshot.document?.trashedAt).toBe('2026-10-26T01:00:00.000Z');
});

it('regression: retrying the same known-failed create intent retains its idempotency key until the payload changes', async () => {
  const test = setup(newSnapshot());
  controls.request.mockResolvedValue(failure('identifier_taken', 409));
  test.channel.edit({ title: 'Same payload', slug: 'same' });
  await test.channel.execute({ kind: 'save' });
  await test.channel.execute({ kind: 'save' });
  expect(controls.request.mock.calls[1]?.[0].idempotencyKey).toBe(
    controls.request.mock.calls[0]?.[0].idempotencyKey,
  );
  test.channel.edit({ title: 'Changed payload', slug: 'changed' });
  await test.channel.execute({ kind: 'save' });
  expect(controls.request.mock.calls[2]?.[0].idempotencyKey).not.toBe(
    controls.request.mock.calls[1]?.[0].idempotencyKey,
  );
});
it('regression: a permission render after an autosave rate-limit response does not schedule another automatic write', async () => {
  vi.useFakeTimers();
  const test = setup();
  controls.request.mockResolvedValue({ ...failure('rate_limited', 429), retryAfterSeconds: 30 });
  test.channel.edit({ title: 'Autosave draft', slug: 'original' });
  test.channel.setAutosave(true);
  await vi.advanceTimersByTimeAsync(1500);
  expect(controls.request).toHaveBeenCalledOnce();
  test.channel.configure({
    can: test.can,
    report: test.report,
    load: test.load,
    created: test.created,
    archived: test.archived,
  });
  await vi.advanceTimersByTimeAsync(60000);
  expect(controls.request).toHaveBeenCalledOnce();
});
it.each(['documents.update', 'collections.get', 'collections.editor', 'documents.get'])(
  'regression: a captured replacement lease cannot PATCH after %s permission is revoked',
  async (denied) => {
    const test = setup();
    const lease = test.channel.beginAsset('replace');
    expect(lease).not.toBeNull();
    test.channel.edit({ title: 'Preserved during revocation', slug: 'original' });
    test.can.mockImplementation((operation) => operation !== denied);
    test.channel.configure({
      can: test.can,
      report: test.report,
      load: test.load,
      created: test.created,
      archived: test.archived,
    });
    const result = await lease?.consumeUpload(
      '30000000-0000-4000-8000-000000000001',
      new AbortController().signal,
    );
    expect(controls.request).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(test.channel.getSnapshot().phase).toBe('blocked');
    expect(test.channel.getSnapshot().draft['title']).toBe('Preserved during revocation');
    expect(lease?.signal.aborted).toBe(false);
    test.can.mockReturnValue(true);
    test.setLatest(snapshot(4));
    await lease?.refresh(new AbortController().signal);
    lease?.finish('confirmed');
    expect(test.channel.getSnapshot().phase).toBe('idle');
  },
);
it('regression: a resource lease does not perform a private reread while its read dependency is revoked', async () => {
  const test = setup();
  const lease = test.channel.beginAsset('reprocess');
  test.can.mockImplementation((operation) => operation !== 'documents.get');
  const result = await lease?.refresh(new AbortController().signal);
  expect(test.load).not.toHaveBeenCalled();
  expect(result).toMatchObject({ ok: false, status: 403 });
  expect(test.channel.getSnapshot().phase).toBe('blocked');
  expect(lease?.signal.aborted).toBe(false);
});
it.each(['publish', 'unpublish', 'move'] as const)(
  'an unknown %s is accepted only after a private snapshot proves the intended change at a later revision',
  async (kind) => {
    const initial = snapshot();
    if (kind === 'unpublish' && initial.document)
      initial.document.publishedVersionId = initial.document.versionId;
    const test = setup(initial);
    controls.request.mockResolvedValue(failure('request_failed', 0, { uncertain: true }));
    const folderId = '50000000-0000-4000-8000-000000000001';
    await test.channel.execute(kind === 'move' ? { kind, folderId } : { kind });
    await test.channel.inspect();
    expect(test.channel.getSnapshot().phase).toBe('blocked');
    const confirmed = snapshot(4);
    if (confirmed.document) {
      if (kind === 'publish')
        confirmed.document.publishedVersionId = initial.document?.versionId ?? null;
      if (kind === 'move') confirmed.document.folderId = folderId;
    }
    test.setLatest(confirmed);
    await test.channel.inspect();
    expect(test.channel.getSnapshot().phase).toBe('idle');
    expect(test.channel.getSnapshot().success).toBe(true);
    expect(controls.request).toHaveBeenCalledOnce();
  },
);
it('an archive verification preserves the blocked draft when trash access fails, then checks the actual active snapshot when the trash is empty', async () => {
  const test = setup();
  controls.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(failure('backend_unavailable', 503))
    .mockResolvedValueOnce(success({ rows: [], total: 0, page: 1, pageSize: 1 }));
  await test.channel.execute({ kind: 'archive' });
  await test.channel.inspect();
  expect(test.load).not.toHaveBeenCalled();
  expect(test.channel.getSnapshot().inspectionError?.status).toBe(503);
  await test.channel.inspect();
  expect(test.load).toHaveBeenCalledOnce();
  expect(test.channel.getSnapshot().phase).toBe('blocked');
  expect(test.archived).not.toHaveBeenCalled();
});
it('revoked trash-list access prevents even an archive verification request and never infers that the archive succeeded', async () => {
  const test = setup();
  controls.request.mockResolvedValue(failure('request_failed', 0, { uncertain: true }));
  await test.channel.execute({ kind: 'archive' });
  test.can.mockImplementation((operation) => operation !== 'documents.list');
  await test.channel.inspect();
  expect(controls.request).toHaveBeenCalledOnce();
  expect(test.channel.getSnapshot().inspectionError?.status).toBe(403);
  expect(test.archived).not.toHaveBeenCalled();
});
it('background snapshots preserve edits at the same revision, expose newer conflicts and permit an explicit discard', () => {
  const test = setup();
  test.channel.edit({ title: 'Local draft', slug: 'original' });
  const same = snapshot();
  same.editor.actions = [];
  test.channel.observe(same);
  expect(test.channel.getSnapshot().draft['title']).toBe('Local draft');
  expect(test.channel.getSnapshot().snapshot.editor.actions).toEqual([]);
  test.channel.observe(snapshot(7, 'Remote replacement'));
  expect(test.channel.getSnapshot().phase).toBe('blocked');
  test.channel.rebase(true);
  expect(test.channel.getSnapshot().draft['title']).toBe('Remote replacement');
  expect(documentDirty(test.channel.getSnapshot())).toBe(false);
});
it('clearing a field validity error permits saving, while cross-identity observations never replace a draft', async () => {
  const test = setup();
  test.channel.edit({ title: 'Valid later', slug: 'original' });
  test.channel.validity('title', 'invalid');
  test.channel.validity('title', 'invalid');
  await test.channel.execute({ kind: 'save' });
  expect(controls.request).not.toHaveBeenCalled();
  test.channel.validity('title', null);
  test.setLatest(snapshot(4, 'Valid later'));
  controls.request.mockResolvedValue(success(snapshot(4, 'Valid later').document));
  await test.channel.execute({ kind: 'save' });
  const other = snapshot(4);
  other.editor.locale = 'zh-CN';
  test.channel.observe(other);
  expect(test.channel.getSnapshot().phase).toBe('blocked');
  expect(test.channel.getSnapshot().snapshot.editor.locale).toBe('en');
});
it('a failed resource write and reread retain the shared lock and expose real errors until a verified terminal refresh', async () => {
  const test = setup();
  const lease = test.channel.beginAsset('replace');
  controls.request.mockResolvedValue(failure('version_conflict', 409));
  const result = await lease?.consumeUpload(
    '30000000-0000-4000-8000-000000000001',
    new AbortController().signal,
  );
  expect(result).toMatchObject({ ok: false, status: 409 });
  test.load.mockResolvedValueOnce(failure('backend_unavailable', 503));
  await lease?.refresh(new AbortController().signal);
  lease?.finish('confirmed');
  expect(test.channel.getSnapshot().phase).toBe('blocked');
  expect(test.channel.getSnapshot().inspectionError?.status).toBe(503);
  test.setLatest(snapshot(4));
  await lease?.refresh(new AbortController().signal);
  lease?.finish('confirmed');
  expect(test.channel.getSnapshot().phase).toBe('idle');
  const after = await lease?.consumeUpload(
    '30000000-0000-4000-8000-000000000002',
    new AbortController().signal,
  );
  expect(after).toMatchObject({ ok: false, status: 0 });
  expect(controls.request).toHaveBeenCalledOnce();
});
it('direct collections do not autosave and disposed requests cannot publish a late response into a later lifecycle', async () => {
  vi.useFakeTimers();
  const initial = snapshot();
  initial.collection.mode = 'direct';
  const test = setup(initial);
  test.channel.edit({ title: 'Direct edit', slug: 'original' });
  test.channel.setAutosave(true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(controls.request).not.toHaveBeenCalled();
  let resolve: ((value: ApiResult<unknown>) => void) | undefined;
  controls.request.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = test.channel.execute({ kind: 'save' });
  test.channel.dispose();
  test.channel.activate();
  resolve?.(success(snapshot(4, 'Direct edit').document));
  await pending;
  expect(test.channel.getSnapshot().phase).toBe('blocked');
  expect(test.channel.getSnapshot().snapshot.document?.revision).toBe(3);
  expect(test.channel.getSnapshot().draft['title']).toBe('Direct edit');
});
