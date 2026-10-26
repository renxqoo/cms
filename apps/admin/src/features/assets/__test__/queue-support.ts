import { budget, ok, second, session, visibility } from '../../../../test/support/admin-asset-data';
import { vi } from 'vitest';
import { createUploadQueue } from '../upload-queue';
import type { ApiResult } from '../../../api/result';
import type { UploadSession } from '../../../contracts/assets';
import type { UploadQueueInput } from '../upload-queue-types';
import type { UploadServices } from '../upload-requests';

export function queueFixture(overrides: Partial<UploadQueueInput> = {}) {
  const services = {
    create: vi.fn<UploadServices['create']>().mockResolvedValue(ok(session())),
    write: vi.fn<UploadServices['write']>().mockImplementation((input) => {
      input.onProgress({ loaded: 2, total: 4 });
      return Promise.resolve(ok({ uploadId: input.session.id, bytes: 4, digest: 'digest' }));
    }),
    complete: vi
      .fn<UploadServices['complete']>()
      .mockImplementation(({ uploadId }) =>
        Promise.resolve(ok(session({ id: uploadId, status: 'processing', jobId: second }))),
      ),
    read: vi
      .fn<UploadServices['read']>()
      .mockImplementation(({ uploadId }) =>
        Promise.resolve(ok(session({ id: uploadId, status: 'processing', jobId: second }))),
      ),
    cancel: vi
      .fn<UploadServices['cancel']>()
      .mockResolvedValue({ ok: true, status: 204, requestId: 'request', data: undefined }),
  };
  const onReady = vi.fn<(value: UploadSession) => void>();
  const onTerminal = vi.fn<(value: UploadSession) => void>();
  const onResult = vi.fn<(value: ApiResult<unknown>) => void>();
  const denied = new Set<string>();
  const can = vi.fn<(operation: string) => boolean>((operation) => !denied.has(operation));
  const controller = createUploadQueue({
    collection: 'images',
    purpose: 'create',
    budget,
    concurrency: 2,
    can,
    services,
    onReady,
    onTerminal,
    onResult,
    visibility: visibility(),
    ...overrides,
  });
  return { denied, can, services, onReady, onTerminal, onResult, controller };
}
