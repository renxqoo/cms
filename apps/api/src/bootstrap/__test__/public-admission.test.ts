import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { createAdmission } from '../admission.ts';

let store: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
afterEach(async () => {
  await store?.close();
  store = undefined;
});

it('keeps shared public BFF reads in an independent cross-instance rate-limit bucket', async () => {
  store = await createTestDatabase();
  const policy = createTestPolicy({ ipRateLimit: 2 });
  const deps = {
    database: store.database,
    policy,
    publicReadIpRateLimit: 5,
    verifyReady: () => Promise.resolve(),
  };
  const first = createAdmission(deps, () => true);
  const second = createAdmission(deps, () => true);
  await first.admitIp('127.0.0.1', 'administration');
  await second.admitIp('127.0.0.1', 'administration');
  await expect(first.admitIp('127.0.0.1', 'administration')).rejects.toMatchObject({
    code: 'rate_limited',
  });
  for (let i = 0; i < 5; i += 1)
    await (i % 2 === 0 ? first : second).admitIp('127.0.0.1', 'public-content');
  await expect(second.admitIp('127.0.0.1', 'public-content')).rejects.toMatchObject({
    code: 'rate_limited',
  });
});
