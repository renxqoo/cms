import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { contentArtifacts } from '../content-artifacts.ts';

const stores: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
const command = fileURLToPath(new URL('../backfill-content.ts', import.meta.url));
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});
async function fixture() {
  const store = await createTestDatabase();
  stores.push(store);
  const env = {
    ...process.env,
    DATABASE_URL: store.connectionString,
    DATABASE_SCHEMA: store.schema,
    CMS_RATE_LIMIT_SECRET: 'isolated-schema-command-test-policy-secret',
    NODE_ENV: 'test',
    CMS_STORAGE_DRIVER: 'unavailable-provider',
  };
  return { store, env };
}
function run(env: NodeJS.ProcessEnv, args: string[]) {
  return spawnSync(process.execPath, ['--no-env-file', command, ...args], {
    env,
    encoding: 'utf8',
    timeout: 15000,
  });
}
it('runs repeatable schema activation against PostgreSQL without constructing the configured unavailable storage', async () => {
  const { store, env } = await fixture();
  const {
    mapping: { fingerprint },
  } = contentArtifacts();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = run(env, ['--activate']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({ type: 'activated', fingerprint });
  }
  expect(
    (
      await store.database.query(
        'SELECT status FROM content_schema_manifests WHERE fingerprint=$1',
        [fingerprint],
      )
    ).rows,
  ).toEqual([{ status: 'ready' }]);
});
it('fails activation when the prepared mapping is missing and rejects invalid arguments before configuration or SQL', async () => {
  const { store, env } = await fixture();
  await store.database.query('DELETE FROM content_schema_manifests');
  const missing = run(env, ['--activate']);
  expect(missing.error).toBeUndefined();
  expect(missing.status).toBe(1);
  expect(missing.stdout).toBe('');
  expect(missing.stderr).toContain('Content schema maintenance failed');
  expect(missing.stderr).not.toContain(store.connectionString);
  const invalid = run({ PATH: process.env.PATH }, ['--activate', '--collection', 'articles']);
  expect(invalid.status).toBe(1);
  expect(invalid.stdout).toBe('');
});
