import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { createResourceSaver } from '../resource-ingestion';
import { collection, editor, session, document, success } from './support';

interface Request {
  operation: string;
  body?: unknown;
  idempotencyKey?: string;
  signal: AbortSignal;
}
const request = vi.hoisted(() => vi.fn<(input: Request) => Promise<ApiResult<unknown>>>());
vi.mock('../../../api/client', () => ({ requestApi: request }));
afterEach(() => vi.resetAllMocks());

function metadata() {
  return {
    ...editor,
    intent: 'create' as const,
    document: null,
    layout: [
      {
        id: 'title',
        name: 'title',
        label: 'Title',
        type: 'text' as const,
        required: true,
        localized: true,
        write: 'allowed' as const,
        constraints: {},
      },
      {
        id: 'copyright',
        name: 'copyright',
        label: 'Copyright',
        type: 'text' as const,
        required: false,
        localized: false,
        write: 'allowed' as const,
        constraints: { defaultValue: 'Initial rights' },
      },
    ],
  };
}

it('automatically creates the actual resource with its filename, configured defaults and upload identity', async () => {
  request.mockResolvedValue(success(document));
  const created = vi.fn<() => void>();
  const save = createResourceSaver({ collection, editor: metadata(), onCreated: created });
  const upload = session({ filename: '会员卡 (1).png', status: 'ready' });
  const result = await save(upload, new AbortController().signal);
  expect(result.ok).toBe(true);
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'documents.create',
    idempotencyKey: upload.id,
    body: {
      locale: 'en',
      data: { title: '会员卡 (1).png', copyright: 'Initial rights' },
      folderId: null,
      uploadId: upload.id,
    },
  });
  expect(created).toHaveBeenCalledOnce();
});

it('retries an uncertain save with the original candidate and key instead of creating a new resource intent', async () => {
  request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(success(document));
  const configured = metadata();
  const created = vi.fn<() => void>();
  const save = createResourceSaver({ collection, editor: configured, onCreated: created });
  const upload = session({ status: 'ready' });
  expect((await save(upload, new AbortController().signal)).ok).toBe(false);
  expect(created).not.toHaveBeenCalled();
  const [, rights] = configured.layout;
  if (rights) rights.constraints.defaultValue = 'Changed rights';
  expect((await save(upload, new AbortController().signal)).ok).toBe(true);
  expect(request.mock.calls[1]?.[0].body).toEqual({
    locale: 'en',
    data: { title: upload.filename, copyright: 'Initial rights' },
    folderId: null,
    uploadId: upload.id,
  });
  expect(request.mock.calls[1]?.[0].idempotencyKey).toBe(upload.id);
  expect(created).toHaveBeenCalledOnce();
});

it('does not create resources from mismatched metadata or refresh the list after an aborted request', async () => {
  const created = vi.fn<() => void>();
  const invalid = createResourceSaver({
    collection,
    editor: { ...metadata(), behaviorHash: 'different' },
    onCreated: created,
  });
  expect((await invalid(session(), new AbortController().signal)).ok).toBe(false);
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue(success(document));
  const signal = new AbortController();
  signal.abort();
  const save = createResourceSaver({ collection, editor: metadata(), onCreated: created });
  await save(session(), signal.signal);
  expect(created).not.toHaveBeenCalled();
});
