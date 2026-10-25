import { createTestStorage } from '../../../../../test/support/temporary-storage.ts';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createDatabase } from '@new-cms/database/client';
import { grantRuntimePrivileges } from '@new-cms/database/privileges';
import { createTestRuntimeDatabase } from '../../../../../test/support/runtime-database.ts';
import { createRuntime } from '../create-runtime.ts';
import { loadConfig } from '../load-config.ts';
import type { ApplicationConfig } from '../load-config.ts';
import { startServer } from '../server.ts';

const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0).toReversed()) await resource.close();
});

async function fixture() {
  const storage = await createTestStorage();
  resources.push(storage);
  const store = await createTestRuntimeDatabase();
  resources.push(store);
  const config = loadConfig({
    DATABASE_URL: store.connectionString,
    DATABASE_SCHEMA: store.schema,
    CMS_STORAGE_ROOT: storage.root,
    CMS_RATE_LIMIT_SECRET: 'isolated-rollout-readiness-policy-secret',
    NODE_ENV: 'test',
    API_PORT: '0',
  });
  const owner = createRuntime(config);
  resources.push(owner);
  await owner.access.reconcile();
  await grantRuntimePrivileges(store.database, {
    roleName: store.roleName,
    profile: owner.runtimeProfile,
  });
  return { store, config, baseUrl: await startRuntime(store, config) };
}

async function startRuntime(
  store: Awaited<ReturnType<typeof createTestRuntimeDatabase>>,
  config: ApplicationConfig,
) {
  const runtime = createRuntime({
    ...config,
    mode: 'production',
    database: { ...config.database, connectionString: store.runtimeConnectionString },
  });
  resources.push(runtime);
  const server = await startServer(runtime, config.http);
  resources.push(server);
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP listener');
  return `http://127.0.0.1:${address.port}`;
}

async function readiness(baseUrl: string) {
  const response = await fetch(`${baseUrl}/readyz`);
  await response.arrayBuffer();
  return response.status;
}

it('keeps the old production public readiness healthy after an owner adds an inaccessible rollout table', async () => {
  const { store, baseUrl } = await fixture();
  expect(await readiness(baseUrl)).toBe(200);
  await store.database.query('CREATE TABLE rollout_extension(id uuid PRIMARY KEY,value text)');
  expect(await readiness(baseUrl)).toBe(200);
  await store.database.query(
    'CREATE VIEW rollout_extension_view AS SELECT id FROM rollout_extension',
  );
  expect(await readiness(baseUrl)).toBe(200);
  await expect(store.runtime.query('SELECT * FROM rollout_extension')).rejects.toMatchObject({
    code: '42501',
  });
});

it.each([
  { privilege: 'SELECT', grantOption: '' },
  { privilege: 'SELECT(id)', grantOption: '' },
  { privilege: 'SELECT(id)', grantOption: 'WITH GRANT OPTION' },
])(
  'rejects unknown expansion permissions $privilege $grantOption and restores public readiness after revocation',
  async ({ privilege, grantOption }) => {
    const { store, baseUrl } = await fixture();
    expect(await readiness(baseUrl)).toBe(200);
    await store.database.query('CREATE TABLE rollout_extension(id int,value text)');
    await store.database.query(
      `GRANT ${privilege} ON rollout_extension TO ${store.roleName} ${grantOption}`,
    );
    expect(await readiness(baseUrl)).toBe(503);
    await store.database.query(`REVOKE ${privilege} ON rollout_extension FROM ${store.roleName}`);
    expect(await readiness(baseUrl)).toBe(200);
  },
);

it('keeps public readiness unavailable when a required known table disappears despite an added table', async () => {
  const { store, baseUrl } = await fixture();
  expect(await readiness(baseUrl)).toBe(200);
  await store.database.query('DROP TABLE credentials');
  await store.database.query('CREATE TABLE rollout_extension(id int)');
  expect(await readiness(baseUrl)).toBe(503);
});

it('keeps the old instance and an old-role restart ready when a separate release role gains expansion access', async () => {
  const { store, config, baseUrl } = await fixture();
  const roleName = `cms_release_${randomUUID().replaceAll('-', '')}`;
  const password = randomUUID();
  await store.database.query(
    `CREATE ROLE ${roleName} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
  );
  const url = new URL(store.runtimeConnectionString);
  url.username = roleName;
  url.password = password;
  const nextRelease = createDatabase({ connectionString: url.toString(), schema: store.schema });
  try {
    await store.database.query('CREATE TABLE rollout_extension(id int,value text)');
    await store.database.query("INSERT INTO rollout_extension VALUES(1,'new release data')");
    await store.database.query(`GRANT USAGE ON SCHEMA ${store.schema} TO ${roleName}`);
    await store.database.query(`GRANT SELECT ON rollout_extension TO ${roleName}`);
    expect(
      (await nextRelease.query('SELECT value FROM rollout_extension WHERE id=1')).rows[0]?.[
        'value'
      ],
    ).toBe('new release data');
    await expect(store.runtime.query('SELECT * FROM rollout_extension')).rejects.toMatchObject({
      code: '42501',
    });
    expect(await readiness(baseUrl)).toBe(200);
    const rollbackUrl = await startRuntime(store, config);
    expect(await readiness(rollbackUrl)).toBe(200);
  } finally {
    await nextRelease.close();
    await store.database.query(`DROP OWNED BY ${roleName}`);
    await store.database.query(`DROP ROLE ${roleName}`);
  }
});
