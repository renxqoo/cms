import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { useReprocess } from '../use-reprocess';
import { job, success, uploadId } from './support';

const mocks = vi.hoisted(() => ({
  request: vi.fn<(...values: unknown[]) => Promise<ApiResult<unknown>>>(),
  report: vi.fn<(...values: unknown[]) => void>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: mocks.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({ reportResult: mocks.report }),
}));
afterEach(() => vi.resetAllMocks());

it('regression: starts image processing after StrictMode replays the mounted controller lifecycle', async () => {
  mocks.request
    .mockResolvedValueOnce(success({ jobId: job().id, uploadId }))
    .mockResolvedValueOnce(success(job({ status: 'succeeded' })));
  const busy = vi.fn<(value: boolean) => void>();
  const changed = vi.fn<() => Promise<void>>().mockResolvedValue();
  const { result, unmount } = renderHook(
    () =>
      useReprocess({
        collection: 'media',
        id: '22222222-2222-4222-8222-222222222222',
        revision: 7,
        onChanged: changed,
        onBusyChange: busy,
      }),
    { wrapper: StrictMode },
  );
  act(() => result.current.start({ variants: [] }));
  await waitFor(() => expect(result.current.phase).toBe('finished'));
  expect(changed).toHaveBeenCalledOnce();
  expect(busy).toHaveBeenLastCalledWith(false);
  unmount();
  act(() => result.current.start({ variants: [] }));
  expect(mocks.request).toHaveBeenCalledTimes(2);
});
