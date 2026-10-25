import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { runCommand } from '../../../../../test/support/process.ts';

const stores: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
const initialize = fileURLToPath(new URL('../initialize-admin.ts', import.meta.url));
const reconcile = fileURLToPath(new URL('../reconcile-operations.ts', import.meta.url));

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
    CMS_RATE_LIMIT_SECRET: 'an-isolated-command-test-rate-limit-secret',
    NODE_ENV: 'test',
  };
  return { store, env };
}

function initializeWith(env: NodeJS.ProcessEnv, password: string) {
  return spawnSync(
    process.execPath,
    ['--no-env-file', initialize, '--email', 'command-owner@example.test'],
    { env, input: `${password}\n`, encoding: 'utf8', timeout: 15000 },
  );
}

it.each(['', 'a'.repeat(14), 'a'.repeat(129)])(
  'explains rejected password requirements without creating an account: %j',
  async (password) => {
    const { store, env } = await fixture();
    const result = initializeWith(env, password);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('15');
    expect(result.stderr).toContain('128');
    expect(result.stderr).toContain('512');
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain('a'.repeat(14));
    const counts = await store.database.query(
      'SELECT (SELECT count(*)::int FROM admins) AS admins,(SELECT count(*)::int FROM credentials) AS credentials,(SELECT count(*)::int FROM audit_events) AS audit',
    );
    expect(counts.rows[0]).toEqual({ admins: 0, credentials: 0, audit: 0 });
  },
);

it('accepts a 15 character Unicode password and explains why a second super administrator initialization is refused', async () => {
  const { store, env } = await fixture();
  runCommand(process.execPath, reconcile, { env });
  const password = '界'.repeat(15);
  const first = initializeWith(env, password);
  expect(first.error).toBeUndefined();
  expect(first.status).toBe(0);
  expect(first.stdout).toContain('Administrator initialized.');
  const second = initializeWith(env, password);
  expect(second.error).toBeUndefined();
  expect(second.status).toBe(1);
  expect(second.stderr).toContain('super administrator already exists');
  expect(first.stdout + first.stderr + second.stdout + second.stderr).not.toContain(password);
  const accounts = await store.database.query(
    'SELECT a.email,a.status,r.is_super FROM admins a JOIN credentials c ON c.admin_id=a.id JOIN roles r ON r.id=a.role_id',
  );
  expect(accounts.rows).toEqual([
    { email: 'command-owner@example.test', status: 'active', is_super: true },
  ]);
});
