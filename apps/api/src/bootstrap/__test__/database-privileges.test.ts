import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { grantRuntimePrivileges } from '@new-cms/database/privileges';
import { createTestRuntimeDatabase } from '../../../../../test/support/runtime-database.ts';
import { createRuntime } from '../create-runtime.ts';
import { loadConfig } from '../load-config.ts';

const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0).toReversed()) await resource.close();
});

async function fixture() {
  const store = await createTestRuntimeDatabase();
  resources.push(store);
  const config = loadConfig({
    DATABASE_URL: store.connectionString,
    DATABASE_SCHEMA: store.schema,
    CMS_RATE_LIMIT_SECRET: 'isolated-bootstrap-privilege-validation-secret',
    NODE_ENV: 'test',
  });
  const owner = createRuntime(config);
  resources.push(owner);
  await owner.access.reconcile();
  return { store, config };
}

it('does not declare production ready when the runtime connection owns the database schema', async () => {
  const { config } = await fixture();
  const runtime = createRuntime({ ...config, mode: 'production' });
  resources.push(runtime);
  await expect(runtime.ready()).rejects.toMatchObject({ code: 'temporarily_unavailable' });
});

it('serves readiness, account initialization and login through a restricted runtime role', async () => {
  const { store, config } = await fixture();
  await grantRuntimePrivileges(store.database, { roleName: store.roleName });
  const runtime = createRuntime({
    ...config,
    mode: 'production',
    database: { ...config.database, connectionString: store.runtimeConnectionString },
  });
  resources.push(runtime);
  await expect(runtime.ready()).resolves.toBeUndefined();
  const password = 'An isolated runtime password 2026';
  const admin = await runtime.access.initializeAdmin({
    email: 'restricted@example.test',
    password,
  });
  const session = await runtime.identity.api.login(
    { requestId: randomUUID(), ip: '127.0.0.1' },
    {
      email: admin.email,
      password,
    },
  );
  expect(session.tokenType).toBe('Bearer');
  expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const records = await store.database.query<{ operation_id: string }>(
    'SELECT operation_id FROM audit_events ORDER BY created_at,id',
  );
  expect(records.rows.map((row) => row.operation_id)).toEqual([
    'access.initializeAdmin',
    'identity.login',
  ]);
});
