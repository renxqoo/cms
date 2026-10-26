import { vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import type { AssetWriteLease } from '../document-asset-types';
import type { AssetWorkServices } from '../document-work-types';
import {
  budget,
  first,
  manifest,
  ok,
  second,
  session,
} from '../../../../test/support/admin-asset-data';
import { queueFixture } from './queue-support';

export function workFixture() {
  const parent = new AbortController();
  const lease = {
    revision: 9,
    signal: parent.signal,
    consumeUpload: vi.fn<AssetWriteLease['consumeUpload']>().mockResolvedValue(ok({})),
    refresh: vi.fn<AssetWriteLease['refresh']>().mockResolvedValue(ok({})),
    finish: vi.fn<AssetWriteLease['finish']>().mockImplementation((outcome) => {
      if (outcome === 'confirmed') parent.abort();
    }),
  };
  const uploads = queueFixture().services;
  uploads.read.mockResolvedValue(
    ok(
      session({
        purpose: 'replace',
        documentId: second,
        revision: 9,
        status: 'consumed',
        manifest,
      }),
    ),
  );
  const services = {
    uploads,
    reprocess: vi
      .fn<AssetWorkServices['reprocess']>()
      .mockResolvedValue(ok({ jobId: second, uploadId: first })),
    job: vi.fn<AssetWorkServices['job']>().mockResolvedValue(
      ok({
        id: second,
        collection: 'images',
        action: 'reprocess',
        status: 'running',
        attempts: 1,
        failureCode: null,
        uploadId: first,
        manifest: null,
      }),
    ),
  };
  const denied = new Set<string>();
  const can = vi.fn<(operation: string) => boolean>((operation) => !denied.has(operation));
  const report = vi.fn<(result: ApiResult<unknown>) => void>();
  return {
    input: {
      collection: 'images',
      documentId: second,
      revision: 9,
      budget,
      lease,
      services,
      report,
      can,
    },
    lease,
    services,
    parent,
    denied,
    can,
  };
}
