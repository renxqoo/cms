import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { cliConfig } from '../config.ts';
import { createSessionStore } from '../state.ts';
import { accessToken, login, logout, oauthForm } from '../oauth.ts';

const realFetch = fetch;
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function config() {
  const root = await mkdtemp(join(tmpdir(), 'cms-oauth-'));
  roots.push(root);
  return cliConfig({ CMS_API_ORIGIN: 'http://127.0.0.1:3001', CMS_CLI_STATE_DIR: root });
}
const token = {
  access_token: 'new-access',
  token_type: 'Bearer',
  expires_in: 600,
  refresh_token: 'new-refresh',
  scope: 'cms offline_access',
};

it('uses body client_id without Basic for a full PKCE login and persists no callback secret in output', async () => {
  const cfg = await config();
  const authorization = Promise.withResolvers<URL>();
  const output: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
    output.push(String(data));
    authorization.resolve(new URL(String(data).replace('Authorize this CLI: ', '').trim()));
    return true;
  });
  const calls: URLSearchParams[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      expect(new Headers(init?.headers).get('authorization')).toBeNull();
      calls.push(
        new URLSearchParams(
          typeof init?.body === 'string' || init?.body instanceof URLSearchParams ? init.body : '',
        ),
      );
      return Promise.resolve(Response.json(token));
    }),
  );
  const pending = login(cfg, { signal: AbortSignal.timeout(2000), browser: false });
  const url = await authorization.promise;
  expect(url.searchParams.get('client_id')).toBe('cms-cli');
  expect(url.searchParams.get('scope')).toBe('cms offline_access');
  expect(url.searchParams.get('resource')).toBe(cfg.origin);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  const redirect = new URL(url.searchParams.get('redirect_uri') ?? '');
  redirect.search = new URLSearchParams({
    state: url.searchParams.get('state') ?? '',
    iss: cfg.origin,
    code: 'authorized-code',
  }).toString();
  expect((await realFetch(redirect)).status).toBe(200);
  await pending;
  expect(calls[0]?.get('grant_type')).toBe('authorization_code');
  expect(calls[0]?.get('client_id')).toBe('cms-cli');
  expect(calls[0]?.get('code')).toBe('authorized-code');
  expect(
    createHash('sha256')
      .update(calls[0]?.get('code_verifier') ?? '')
      .digest('base64url'),
  ).toBe(url.searchParams.get('code_challenge'));
  expect((await createSessionStore(cfg).read())?.accessToken).toBe('new-access');
  expect(output.join('')).not.toContain('authorized-code');
  expect(output.join('')).not.toContain('new-access');
});

it('serializes refresh rotation and rereads the stored token after taking the lock', async () => {
  const cfg = await config();
  const store = createSessionStore(cfg);
  await store.write({
    accessToken: 'expired',
    refreshToken: 'one-use',
    expiresAt: 0,
    scope: 'cms offline_access',
  });
  const calls: URLSearchParams[] = [];
  const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
    calls.push(new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : ''));
    expect(new Headers(init?.headers).get('authorization')).toBeNull();
    return Promise.resolve(Response.json(token));
  });
  vi.stubGlobal('fetch', fetcher);
  const signal = AbortSignal.timeout(2000);
  expect(await Promise.all([accessToken(cfg, { signal }), accessToken(cfg, { signal })])).toEqual([
    'new-access',
    'new-access',
  ]);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(calls[0]?.get('grant_type')).toBe('refresh_token');
  expect(calls[0]?.get('refresh_token')).toBe('one-use');
  expect(calls[0]?.get('resource')).toBe(cfg.origin);
  expect((await store.read())?.refreshToken).toBe('new-refresh');
  expect(await accessToken(cfg, { signal })).toBe('new-access');
});

it('refreshes a rejected valid token once, revokes only this login and clears credentials after success', async () => {
  const cfg = await config();
  const store = createSessionStore(cfg);
  await store.write({
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    expiresAt: Date.now() + 999999,
    scope: 'cms offline_access',
  });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(token))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  expect(
    await accessToken(cfg, { signal: AbortSignal.timeout(2000), rejectedToken: 'old-access' }),
  ).toBe('new-access');
  await logout(cfg, AbortSignal.timeout(2000));
  expect(fetcher.mock.calls[1]?.[0]).toBe(`${cfg.origin}/oauth/revoke`);
  const body = fetcher.mock.calls[1]?.[1]?.body;
  expect(body instanceof URLSearchParams && body.get('token')).toBe('new-refresh');
  expect(await store.read()).toBeNull();
  await logout(cfg, AbortSignal.timeout(2000));
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('retains credentials when revocation fails and rejects expired sessions without refresh tokens', async () => {
  const cfg = await config();
  const store = createSessionStore(cfg);
  await expect(accessToken(cfg, { signal: AbortSignal.timeout(2000) })).rejects.toThrow(
    'auth login',
  );
  await store.write({ accessToken: 'expired', expiresAt: 0, scope: 'cms' });
  await expect(accessToken(cfg, { signal: AbortSignal.timeout(2000) })).rejects.toThrow(
    'Session expired',
  );
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
  );
  await expect(logout(cfg, AbortSignal.timeout(2000))).rejects.toThrow('OAuth request failed');
  expect((await store.read())?.accessToken).toBe('expired');
  expect(
    await accessToken(
      { ...cfg, token: 'environment-token' },
      { signal: AbortSignal.timeout(1000) },
    ),
  ).toBe('environment-token');
});

it('requires a secure fixed API origin and ignores credentials from another profile', async () => {
  const cfg = await config();
  expect(() => cliConfig({ CMS_API_ORIGIN: 'http://evil.example' })).toThrow('HTTPS');
  expect(() => cliConfig({ CMS_API_ORIGIN: 'https://api.example/path' })).toThrow('origin');
  await createSessionStore(cfg).write({
    accessToken: 'private',
    expiresAt: Date.now() + 100000,
    scope: 'cms',
  });
  await expect(
    accessToken({ ...cfg, profile: 'other' }, { signal: AbortSignal.timeout(1000) }),
  ).rejects.toThrow('auth login');
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null)));
  await expect(
    oauthForm(cfg, '/oauth/revoke', {
      fields: { token: 'private' },
      signal: AbortSignal.timeout(1000),
    }),
  ).resolves.toBeNull();
});

it('regression: an old in-flight refresh cannot overwrite a newly completed login to another account', async () => {
  const cfg = await config();
  const store = createSessionStore(cfg);
  await store.write({
    accessToken: 'old-A',
    refreshToken: 'refresh-A',
    expiresAt: 0,
    scope: 'cms offline_access',
  });
  const refreshingStarted = Promise.withResolvers<void>();
  const refreshingResponse = Promise.withResolvers<Response>();
  const authorizing = Promise.withResolvers<URL>();
  vi.spyOn(process.stderr, 'write').mockImplementation((value) => {
    authorizing.resolve(new URL(String(value).replace('Authorize this CLI: ', '').trim()));
    return true;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      const body = new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : '');
      if (body.get('grant_type') === 'refresh_token') {
        refreshingStarted.resolve();
        return refreshingResponse.promise;
      }
      return Promise.resolve(
        Response.json({ ...token, access_token: 'new-account-B', refresh_token: 'refresh-B' }),
      );
    }),
  );
  const signal = AbortSignal.timeout(3000);
  const refreshing = accessToken(cfg, { signal });
  await refreshingStarted.promise;
  const loggingIn = login(cfg, { signal, browser: false });
  const authorization = await authorizing.promise;
  const redirect = new URL(authorization.searchParams.get('redirect_uri') ?? '');
  redirect.search = new URLSearchParams({
    state: authorization.searchParams.get('state') ?? '',
    iss: cfg.origin,
    code: 'code-B',
  }).toString();
  await realFetch(redirect);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ordering = await Promise.race([
    loggingIn.then(() => 'login-completed'),
    new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve('refresh-pending'), 250);
    }),
  ]);
  clearTimeout(timer);
  refreshingResponse.resolve(
    Response.json({
      ...token,
      access_token: 'refreshed-account-A',
      refresh_token: 'new-refresh-A',
    }),
  );
  await Promise.all([refreshing, loggingIn]);
  expect(ordering).toBe('refresh-pending');
  expect((await store.read())?.accessToken).toBe('new-account-B');
});
