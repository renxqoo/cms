import { createHash, randomBytes } from 'node:crypto';
import { AuthenticationError, ValidationError } from '@renxqoo/agent-cli-sdk';
import { z } from 'zod';
import { readBytes } from '@new-cms/api-client/client';
import { openCallback } from './callback.ts';
import { createBrowserOpener } from './browser-opener.ts';
import { createSessionStore } from './state.ts';
import type { StoredSession } from './state.ts';
import type { CliConfig } from './config.ts';

const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal('Bearer'),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().default('cms'),
});

export async function oauthForm(
  config: CliConfig,
  path: '/oauth/token' | '/oauth/revoke',
  options: { fields: Record<string, string>; signal: AbortSignal },
): Promise<unknown> {
  const response = await fetch(`${config.origin}${path}`, {
    method: 'POST',
    body: new URLSearchParams({ ...options.fields, client_id: 'cms-cli' }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    redirect: 'error',
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(config.timeoutMs)]),
  });
  const bytes = await readBytes(response, config.oauthResponseLimitBytes);
  const value: unknown = protocolValue(bytes);
  if (!response.ok) protocolFailure(response.status, value);
  return value;
}

function protocolValue(bytes: Uint8Array): unknown {
  if (bytes.byteLength === 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Invalid OAuth response');
  }
}

function protocolFailure(status: number, value: unknown): never {
  const result = z.object({ error: z.string() }).safeParse(value);
  if (
    status === 401 ||
    (result.success &&
      ['invalid_grant', 'invalid_token', 'unauthorized_client', 'access_denied'].includes(
        result.data.error,
      ))
  )
    throw new AuthenticationError({
      subtype: 'token_expired',
      message: 'Session expired or revoked; run cms auth login',
    });
  throw new Error(`OAuth request failed (${status})`);
}

function session(value: unknown): StoredSession {
  const token = tokenSchema.parse(value);
  return {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope,
    ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
  };
}

function loginUrl(
  origin: string,
  input: { state: string; verifier: string; redirectUri: string },
): URL {
  const url = new URL('/oauth/authorize', origin);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: 'cms-cli',
    redirect_uri: input.redirectUri,
    scope: 'cms offline_access',
    resource: origin,
    state: input.state,
    code_challenge: createHash('sha256').update(input.verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  return url;
}

function requireManagedProfile(config: CliConfig): void {
  if (config.token)
    throw new ValidationError({
      subtype: 'invalid_argument',
      message: 'CMS_ACCESS_TOKEN overrides this profile; remove it before managing its login',
    });
}

export async function login(
  config: CliConfig,
  options: { signal: AbortSignal; browser: boolean },
): Promise<void> {
  requireManagedProfile(config);
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const callback = await openCallback({
    state,
    issuer: config.origin,
    timeoutMs: config.loginTimeoutMs,
    limits: config.callbackLimits,
    signal: options.signal,
  });
  const url = loginUrl(config.origin, { state, verifier, redirectUri: callback.redirectUri });
  const openingController = new AbortController();
  let opening: Promise<void> | undefined;
  try {
    process.stderr.write(`Authorize this CLI: ${url}\n`);
    if (options.browser)
      opening = createBrowserOpener({
        signal: AbortSignal.any([options.signal, openingController.signal]),
        timeoutMs: config.browserOpenTimeoutMs,
      })
        .open(url.href)
        .catch(() => {});
    const code = await callback.result;
    const value = await oauthForm(config, '/oauth/token', {
      fields: {
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: callback.redirectUri,
        resource: config.origin,
      },
      signal: options.signal,
    });
    const store = createSessionStore(config);
    const next = session(value);
    await store.locked(() => store.write(next), options.signal);
  } finally {
    openingController.abort();
    await opening;
    callback.close();
  }
}

export async function accessToken(
  config: CliConfig,
  options: { signal: AbortSignal; rejectedToken?: string },
): Promise<string> {
  if (config.token) return config.token;
  const store = createSessionStore(config);
  const initial = await store.read();
  if (!initial)
    throw new AuthenticationError({
      subtype: 'no_credentials',
      message: 'Run cms auth login first',
    });
  if (
    initial.expiresAt > Date.now() + config.refreshSkewMs &&
    initial.accessToken !== options.rejectedToken
  )
    return initial.accessToken;
  return store.locked(async () => {
    const current = await store.read();
    if (!current)
      throw new AuthenticationError({
        subtype: 'no_credentials',
        message: 'Run cms auth login first',
      });
    if (
      current.expiresAt > Date.now() + config.refreshSkewMs &&
      current.accessToken !== options.rejectedToken
    )
      return current.accessToken;
    if (!current.refreshToken)
      throw new AuthenticationError({
        subtype: 'token_expired',
        message: 'Session expired; run cms auth login',
      });
    const value = await oauthForm(config, '/oauth/token', {
      fields: {
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken,
        resource: config.origin,
      },
      signal: options.signal,
    });
    const next = session(value);
    await store.write(next);
    return next.accessToken;
  }, options.signal);
}

export async function logout(config: CliConfig, signal: AbortSignal): Promise<void> {
  requireManagedProfile(config);
  const store = createSessionStore(config);
  await store.locked(async () => {
    const current = await store.read();
    if (!current) return;
    await oauthForm(config, '/oauth/revoke', {
      fields: {
        token: current.refreshToken ?? current.accessToken,
        token_type_hint: current.refreshToken ? 'refresh_token' : 'access_token',
      },
      signal,
    });
    await store.clear();
  }, signal);
}
