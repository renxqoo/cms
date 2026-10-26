import { expect, it, vi } from 'vitest';
import JobsEntry from '../page';
import CleanupEntry from '../../asset-cleanups/page';

const session = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock('../../../../../server/require-session', () => ({ requireSession: session }));
vi.mock('../../../../../features/jobs/jobs-page', () => ({ JobsPage: () => null }));
vi.mock('../../../../../features/asset-cleanups/cleanups-page', () => ({
  CleanupsPage: () => null,
}));

it('requires a verified server session before either operational workspace can render', async () => {
  session.mockRejectedValueOnce(new Error('session expired'));
  await expect(JobsEntry()).rejects.toThrow('session expired');
  session.mockRejectedValueOnce(new Error('session expired'));
  await expect(CleanupEntry()).rejects.toThrow('session expired');
  session.mockImplementation(() => Promise.resolve());
  expect(await JobsEntry()).not.toBeNull();
  expect(await CleanupEntry()).not.toBeNull();
});
