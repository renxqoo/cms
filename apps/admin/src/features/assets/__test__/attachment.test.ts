import { expect, it, afterEach, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { attachFile, verifyAttachment } from '../attachment';
import type { AttachmentInput } from '../attachment';
import { collection, document, editor, manifest, session, success } from './support';

interface Request {
  operation: string;
  body?: unknown;
  query?: unknown;
  signal: AbortSignal;
}
const mocks = vi.hoisted(() => ({
  request: vi.fn<(value: Request) => Promise<ApiResult<unknown>>>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: mocks.request }));
afterEach(() => vi.resetAllMocks());
function input(): AttachmentInput {
  return {
    props: {
      collection,
      document,
      editor,
      onDocumentChanged: vi.fn<(...values: unknown[]) => void>(),
    },
    pending: { current: null },
    setError: vi.fn<(...values: unknown[]) => void>(),
    setUncertain: vi.fn<(...values: unknown[]) => void>(),
    changed: vi.fn<() => Promise<void>>().mockResolvedValue(),
    release: vi.fn<(...values: unknown[]) => void>(),
    externalBusy: false,
    writable: true,
    uncertain: session({ status: 'ready', manifest }),
    reportResult: vi.fn<(...values: unknown[]) => void>(),
  };
}

it('binds a ready replacement with the original CAS revision and refreshes before releasing the document channel', async () => {
  mocks.request.mockResolvedValue(success({ ...document, revision: 8 }));
  const state = input();
  await attachFile(state, session({ status: 'ready', manifest }));
  expect(mocks.request.mock.calls[0]?.[0].body).toEqual({
    locale: 'en',
    revision: 7,
    uploadId: session().id,
  });
  expect(state.changed).toHaveBeenCalledOnce();
  expect(state.release).toHaveBeenCalledOnce();
  expect(state.setUncertain).toHaveBeenCalledWith(null);
});

it('blocks an unrelated parent write, denied metadata, duplicate active write and unsaved document', async () => {
  const ready = session({ status: 'ready', manifest });
  for (const patch of [
    { externalBusy: true },
    { writable: false },
    { pending: { current: new AbortController() } },
    {
      props: {
        collection,
        document: null,
        editor,
        onDocumentChanged: vi.fn<(...values: unknown[]) => void>(),
      },
    },
  ])
    await attachFile({ ...input(), ...patch }, ready);
  expect(mocks.request).not.toHaveBeenCalled();
});

it('retains the old document and the uncertain session when a replacement acknowledgement is lost', async () => {
  const lost = failure('request_failed', 0, { uncertain: true });
  mocks.request.mockResolvedValue(lost);
  const state = input();
  const ready = session({ status: 'ready', manifest });
  await attachFile(state, ready);
  expect(state.setUncertain).toHaveBeenCalledWith(ready);
  expect(state.setError).toHaveBeenCalledWith(lost);
  expect(state.release).not.toHaveBeenCalled();
  expect(state.changed).not.toHaveBeenCalled();
});

it('does not silently apply a replacement conflict or ignore cancellation of an in-flight request', async () => {
  const state = input();
  mocks.request.mockResolvedValueOnce(failure('version_conflict', 409));
  await attachFile(state, session({ status: 'ready', manifest }));
  expect(state.release).not.toHaveBeenCalled();
  expect(state.setUncertain).not.toHaveBeenCalled();
  mocks.request.mockImplementationOnce((request) => {
    state.pending.current?.abort();
    expect(request.signal.aborted).toBe(true);
    return Promise.resolve(success(document));
  });
  await attachFile(state, session());
  expect(state.changed).not.toHaveBeenCalled();
});

it('confirms a lost acknowledgement only when consumed upload and current document identify the same immutable manifest', async () => {
  mocks.request
    .mockResolvedValueOnce(success(session({ status: 'consumed', manifest })))
    .mockResolvedValueOnce(success({ ...document, revision: 8 }));
  const state = input();
  await verifyAttachment(state);
  expect(mocks.request.mock.calls[1]?.[0].query).toEqual({
    locale: 'en',
    fallback: [],
    depth: 0,
    mode: 'editing',
  });
  expect(state.changed).toHaveBeenCalledOnce();
  expect(state.release).toHaveBeenCalledOnce();
});

it('permits explicit retry after observing ready session and unchanged revision, but does not rebind against a changed revision', async () => {
  const state = input();
  mocks.request
    .mockResolvedValueOnce(success(session({ status: 'ready', manifest })))
    .mockResolvedValueOnce(success(document));
  await verifyAttachment(state);
  expect(state.setUncertain).toHaveBeenCalledWith(null);
  expect(state.release).not.toHaveBeenCalled();
  vi.mocked(state.setUncertain).mockClear();
  mocks.request
    .mockResolvedValueOnce(success(session({ status: 'consumed', manifest })))
    .mockResolvedValueOnce(
      success({
        ...document,
        revision: 8,
        file: { ...manifest, id: '66666666-6666-4666-8666-666666666666' },
      }),
    );
  await verifyAttachment(state);
  expect(state.setUncertain).not.toHaveBeenCalled();
  expect(state.release).not.toHaveBeenCalled();
});

it('keeps failed verification visible and refuses to run without an uncertain target', async () => {
  for (const operation of ['upload', 'document']) {
    const state = input();
    const denied = failure('forbidden', 403);
    mocks.request
      .mockResolvedValueOnce(operation === 'upload' ? denied : success(session()))
      .mockResolvedValueOnce(operation === 'document' ? denied : success(document));
    await verifyAttachment(state);
    expect(state.setError).toHaveBeenCalledWith(denied);
    expect(state.release).not.toHaveBeenCalled();
  }
  await verifyAttachment({ ...input(), uncertain: null });
  expect(mocks.request).toHaveBeenCalledTimes(4);
});
