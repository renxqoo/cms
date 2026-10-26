import { afterEach, expect, it } from 'vitest';
import { chmod, lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionStore } from '../state.ts';
import { openCallback } from '../callback.ts';
import { cliConfig } from '../config.ts';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function store() {
  const stateDir = await mkdtemp(join(tmpdir(), 'cms-state-'));
  roots.push(stateDir);
  const config = cliConfig({ CMS_API_ORIGIN: 'https://cms.example', CMS_CLI_STATE_DIR: stateDir });
  return { config, store: createSessionStore(config) };
}
const session = {
  accessToken: 'sensitive-access',
  refreshToken: 'sensitive-refresh',
  expiresAt: 123456789,
  scope: 'cms offline_access',
};

it('stores credentials atomically with private permissions and isolates both origin and profile', async () => {
  const { config, store: first } = await store();
  expect(await first.read()).toBeNull();
  await first.write(session);
  expect(await first.read()).toEqual(session);
  expect((await lstat(first.path)).mode & 0o777).toBe(0o600);
  expect((await lstat(first.directory)).mode & 0o777).toBe(0o700);
  expect((await lstat(config.stateDir)).mode & 0o777).toBe(0o700);
  expect(await createSessionStore({ ...config, profile: '../profile' }).read()).toBeNull();
  expect(
    await createSessionStore({ ...config, origin: 'https://other.example' }).read(),
  ).toBeNull();
  await chmod(first.path, 0o644);
  await first.read();
  expect((await lstat(first.path)).mode & 0o777).toBe(0o600);
  expect(await readdir(first.directory)).toEqual(['session.json']);
  await first.clear();
  expect(await first.read()).toBeNull();
});

it('serializes concurrent refresh work and refuses stale locks without deleting a competing owner', async () => {
  const { store: first } = await store();
  await first.write({ ...session, accessToken: '0' });
  const controller = new AbortController();
  const work = () =>
    first.locked(async () => {
      const value = await first.read();
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      await first.write({ ...session, accessToken: String(Number(value?.accessToken) + 1) });
    }, controller.signal);
  await Promise.all([work(), work(), work()]);
  expect((await first.read())?.accessToken).toBe('3');
  await expect(
    first.locked(() => Promise.reject(new Error('failed')), controller.signal),
  ).rejects.toThrow('failed');
  expect(await readdir(first.directory)).toEqual(['session.json']);
  await writeFile(
    join(first.directory, 'refresh.lock'),
    JSON.stringify({ pid: 2147483647, nonce: 'dead' }),
  );
  await expect(first.locked(() => Promise.resolve(), controller.signal)).rejects.toThrow(
    'Stale credential lock',
  );
  expect(await readdir(first.directory)).toContain('refresh.lock');
});

it('cancels lock waits and rejects symlink credentials without exposing their content', async () => {
  const { store: first } = await store();
  await first.write(session);
  await writeFile(
    join(first.directory, 'refresh.lock'),
    JSON.stringify({ pid: process.pid, nonce: 'other' }),
  );
  await expect(first.locked(() => Promise.resolve(), AbortSignal.timeout(30))).rejects.toThrow(
    Error,
  );
  await rm(first.path);
  const target = join(first.directory, 'foreign');
  await writeFile(target, 'private');
  await symlink(target, first.path);
  await expect(first.read()).rejects.toThrow('Unsafe credential file');
  expect(await readFile(target, 'utf8')).toBe('private');
});

it('accepts one random loopback PKCE callback and closes its listener afterwards', async () => {
  const callback = await openCallback({
    limits: { headerBytes: 8192, urlCharacters: 4096, codeCharacters: 1024 },
    state: 'state',
    issuer: 'https://cms.example',
    timeoutMs: 1000,
    signal: new AbortController().signal,
  });
  const redirect = new URL(callback.redirectUri);
  expect(redirect.hostname).toBe('127.0.0.1');
  expect(redirect.pathname).toBe('/callback');
  expect(Number(redirect.port)).toBeGreaterThan(0);
  expect(
    (await fetch(`${callback.redirectUri}?state=state&iss=https%3A%2F%2Fcms.example&code=one`))
      .status,
  ).toBe(200);
  await expect(callback.result).resolves.toBe('one');
  await expect(fetch(callback.redirectUri)).rejects.toThrow(Error);
});

it.each([
  'state=wrong&iss=https%3A%2F%2Fcms.example&code=one',
  'state=state&iss=https%3A%2F%2Fevil.example&code=one',
  'state=state&state=state&iss=https%3A%2F%2Fcms.example&code=one',
  'state=state&iss=https%3A%2F%2Fcms.example&error=access_denied',
])('rejects unsafe OAuth callback %s and closes the listener', async (query) => {
  const callback = await openCallback({
    limits: { headerBytes: 8192, urlCharacters: 4096, codeCharacters: 1024 },
    state: 'state',
    issuer: 'https://cms.example',
    timeoutMs: 1000,
    signal: new AbortController().signal,
  });
  const result = callback.result.catch((error: unknown) => error);
  expect((await fetch(`${callback.redirectUri}?${query}`)).status).toBe(400);
  await result;
  await expect(fetch(callback.redirectUri)).rejects.toThrow(Error);
});

it('times out and cancels OAuth callbacks without leaving listeners active', async () => {
  const callback = await openCallback({
    limits: { headerBytes: 8192, urlCharacters: 4096, codeCharacters: 1024 },
    state: 'state',
    issuer: 'https://cms.example',
    timeoutMs: 15,
    signal: new AbortController().signal,
  });
  await expect(callback.result).rejects.toThrow('timed out');
  const controller = new AbortController();
  const cancelled = await openCallback({
    limits: { headerBytes: 8192, urlCharacters: 4096, codeCharacters: 1024 },
    state: 'state',
    issuer: 'https://cms.example',
    timeoutMs: 1000,
    signal: controller.signal,
  });
  controller.abort();
  await expect(cancelled.result).rejects.toThrow('cancelled');
  await expect(fetch(cancelled.redirectUri)).rejects.toThrow(Error);
});

it('regression: a live competing process cannot make the configured credential lock wait unbounded', async () => {
  const { config, store: first } = await store();
  await first.write(session);
  await writeFile(
    join(first.directory, 'refresh.lock'),
    JSON.stringify({ pid: process.pid, nonce: 'competing' }),
  );
  const limited = createSessionStore({
    ...config,
    lockLimits: { ...config.lockLimits, waitMs: 20 },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Outer deadline')), 500);
  try {
    await expect(limited.locked(() => Promise.resolve(), controller.signal)).rejects.toThrow(Error);
    expect(controller.signal.aborted).toBe(false);
  } finally {
    clearTimeout(timer);
  }
});
