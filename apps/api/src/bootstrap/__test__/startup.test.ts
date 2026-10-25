import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { startupFailure } from '../startup-error.ts';

function start(env: NodeJS.ProcessEnv) {
  return spawnSync(
    process.execPath,
    ['--no-env-file', fileURLToPath(new URL('../../main.ts', import.meta.url))],
    { env: { PATH: process.env.PATH, NODE_ENV: 'test', ...env }, encoding: 'utf8', timeout: 5000 },
  );
}

it('reports missing environment variable names when startup configuration is absent', () => {
  const result = start({});
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('DATABASE_URL');
  expect(result.stderr).toContain('CMS_RATE_LIMIT_SECRET');
  expect(result.stderr).toContain('.env.example');
});

it('reports invalid configuration fields without exposing database credentials or secret values', () => {
  const database = 'postgresql://owner:private-database-password@[';
  const secret = 'private-short-secret';
  const result = start({ DATABASE_URL: database, CMS_RATE_LIMIT_SECRET: secret });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('DATABASE_URL');
  expect(result.stderr).toContain('CMS_RATE_LIMIT_SECRET');
  expect(result.stderr).not.toContain(database);
  expect(result.stderr).not.toContain('private-database-password');
  expect(result.stderr).not.toContain(secret);
  expect(result.stdout).toBe('');
});

it('keeps unknown startup errors and non-environment validation errors out of logs', () => {
  for (const error of [
    new Error('password=private-provider-password'),
    z.string().safeParse(1).error,
  ]) {
    const message = startupFailure(error);
    expect(message).toContain('verify configuration, migrations and operation catalog');
    expect(message).not.toContain('private-provider-password');
    expect(message).not.toContain('invalid_type');
  }
});
