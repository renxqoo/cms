import { z } from 'zod';
import { flattenCommands } from '@renxqoo/agent-cli-sdk';
import { operations } from '@new-cms/api-client/operations';
import { businessCommands } from '../commands.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCli } from '../app.ts';
import { cliConfig } from '../config.ts';

const roots: string[] = [];
const { exitCode } = process;
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.exitCode = exitCode;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'cms-cli-app-'));
  roots.push(root);
  const cfg = cliConfig({
    CMS_API_ORIGIN: 'https://api.example',
    CMS_ACCESS_TOKEN: 'sensitive-token',
    CMS_CLI_STATE_DIR: root,
    CMS_CLI_FILE_LIMIT_BYTES: '8',
  });
  const stdout: string[] = [];
  const stderr: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((value) => {
    stdout.push(String(value));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((value) => {
    stderr.push(String(value));
    return true;
  });
  return { app: createCli(cfg, AbortSignal.timeout(1000)), stdout, stderr, root, cfg };
}

it('uses SDK JSON arguments and stdout envelopes for business data through the HTTP request plugin', async () => {
  const { app, stdout, stderr } = await setup();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ displayName: 'Editor' }));
  vi.stubGlobal('fetch', fetcher);
  await app.run(['access', 'me', '--input', '{"input":{}}']);
  expect(JSON.parse(stdout.join('')) as unknown).toMatchObject({
    ok: true,
    data: { displayName: 'Editor' },
  });
  expect(stderr).toEqual([]);
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.example/v1/me');
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
    'Bearer sensitive-token',
  );
});

it('registers camel-case content namespaces as valid CLI routes and reads public content without forwarding an account token', async () => {
  const { app, stdout, stderr } = await setup();
  const value = { contractVersion: 'oneaster-public.v1', data: { home: null, featuredModels: [] } };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(value));
  vi.stubGlobal('fetch', fetcher);
  await app.run(['public-content', 'home', '--input', '{"input":{"locale":"en"}}']);
  expect(JSON.parse(stdout.join('')) as unknown).toMatchObject({ ok: true, data: value });
  expect(stderr).toEqual([]);
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.example/v1/public/home?locale=en');
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has('authorization')).toBe(false);
});

it('keeps API code and requestId on stderr, uses SDK exit codes and emits no success for errors', async () => {
  const { app, stdout, stderr } = await setup();
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ error: { code: 'forbidden', requestId: 'trace-4' } }, { status: 403 }),
      ),
  );
  await app.run(['access', 'me', '--input', '{"input":{}}']);
  expect(stdout).toEqual([]);
  expect(JSON.parse(stderr.join('')) as unknown).toMatchObject({
    ok: false,
    error: { code: 'forbidden', requestId: 'trace-4', status: 403 },
  });
  expect(process.exitCode).toBe(3);
  expect(stderr.join('')).not.toContain('sensitive-token');
});

it('uses explicit local file input and output while keeping downloaded bytes out of JSON stdout', async () => {
  const { app, stdout, root } = await setup();
  const original = new Uint8Array([0, 255, 128, 10]);
  const path = join(root, 'source.bin');
  await writeFile(path, original);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ bytes: 4 }))
    .mockResolvedValueOnce(new Response(original));
  vi.stubGlobal('fetch', fetcher);
  const id = '11111111-1111-4111-8111-111111111111';
  await app.run([
    'assets',
    'write-upload',
    '--input',
    JSON.stringify({ input: { collection: 'media', uploadId: id }, file: path }),
  ]);
  expect(
    new Uint8Array(await new Response(fetcher.mock.calls[0]?.[1]?.body).arrayBuffer()),
  ).toEqual(original);
  stdout.splice(0);
  const output = join(root, 'download.bin');
  await app.run([
    'assets',
    'download',
    '--input',
    JSON.stringify({ input: { collection: 'media', id }, output }),
  ]);
  expect(new Uint8Array(await readFile(output))).toEqual(original);
  expect(JSON.parse(stdout.join('')) as unknown).toMatchObject({
    ok: true,
    data: { bytes: 4, output },
  });
  expect(stdout.join('')).not.toContain('base64');
});

it('rejects invalid inputs before making requests and returns SDK validation failures', async () => {
  const { app, stdout, stderr } = await setup();
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  await app.run(['roles', 'delete', '--input', '{"input":{"id":"invalid","version":-1}}']);
  expect(stdout).toEqual([]);
  expect(stderr.join('')).toContain('invalid_input');
  expect(process.exitCode).toBe(2);
  expect(fetcher).not.toHaveBeenCalled();
});

it('offers auth status without exposing stored tokens and SDK help includes every operation route', async () => {
  const { app, stdout } = await setup();
  await app.run(['auth', 'status']);
  expect(JSON.parse(stdout.join('')) as unknown).toMatchObject({
    ok: true,
    data: { loggedIn: true, profile: 'default' },
  });
  expect(stdout.join('')).not.toContain('sensitive-token');
  stdout.splice(0);
  await app.run(['--help']);
  expect(stdout.join('')).toContain('assets download-binding');
  expect(stdout.join('')).toContain('documents restore-trash');
});

it('reports network failures once and never retries them', async () => {
  const { app, stdout, stderr } = await setup();
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('connection failed'));
  vi.stubGlobal('fetch', fetcher);
  await app.run(['access', 'me', '--input', '{"input":{}}']);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(stdout).toEqual([]);
  expect(stderr.join('')).toContain('connection failed');
  expect(process.exitCode).toBe(4);
});

it('requires file paths and output destinations, rejects oversized input and refuses to overwrite an output', async () => {
  const { app, stderr, root } = await setup();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([0])));
  vi.stubGlobal('fetch', fetcher);
  const input = { collection: 'media', uploadId: '11111111-1111-4111-8111-111111111111' };
  await app.run(['assets', 'write-upload', '--input', JSON.stringify({ input })]);
  expect(process.exitCode).toBe(2);
  expect(stderr.join('')).toContain('explicit file path');
  stderr.splice(0);
  const path = join(root, 'too-large.bin');
  await writeFile(path, new Uint8Array(9));
  await app.run(['assets', 'write-upload', '--input', JSON.stringify({ input, file: path })]);
  expect(stderr.join('')).toContain('byte limit');
  const documentInput = { collection: 'media', id: input.uploadId };
  await app.run(['assets', 'download', '--input', JSON.stringify({ input: documentInput })]);
  expect(stderr.join('')).toContain('explicit output');
  expect(fetcher).not.toHaveBeenCalled();
});

it('maps the generated operation identities to exactly one stable SDK route each', () => {
  const routes = flattenCommands({ commands: {}, namespaces: businessCommands(20_971_520) })
    .map((command) => command.path)
    .toSorted((left, right) => left.localeCompare(right));
  expect(routes).toEqual(
    operations
      .map((operation) => operation.command)
      .toSorted((left, right) => left.localeCompare(right)),
  );
});

it('refuses the SDK API key flag rather than silently using a broader stored identity', async () => {
  const { app, stdout, stderr } = await setup();
  expect(() =>
    app.run(['access', 'me', '--api-key', 'restricted-key', '--input', '{"input":{}}']),
  ).toThrow('BareError(2)');
  expect(stdout).toEqual([]);
  expect(stderr.join('')).toContain('API keys target MCP');
  expect(stderr.join('')).not.toContain('restricted-key');
});

it('reports missing OAuth credentials as authentication exit 3 without making an API request', async () => {
  const { stdout, stderr, cfg } = await setup();
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  const { token: _token, ...withoutToken } = cfg;
  await createCli(withoutToken, AbortSignal.timeout(1000)).run([
    'access',
    'me',
    '--input',
    '{"input":{}}',
  ]);
  expect(process.exitCode).toBe(3);
  expect(stdout).toEqual([]);
  expect(stderr.join('')).toContain('no_credentials');
  expect(fetcher).not.toHaveBeenCalled();
});

it('reports a revoked refresh grant as authentication exit 3 without leaking the saved refresh token', async () => {
  const { stdout, stderr, cfg } = await setup();
  const { token: _token, ...withoutToken } = cfg;
  const { createSessionStore } = await import('../state.ts');
  await createSessionStore(withoutToken).write({
    accessToken: 'revoked-access',
    refreshToken: 'revoked-refresh-secret',
    expiresAt: 0,
    scope: 'cms offline_access',
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 })),
  );
  await createCli(withoutToken, AbortSignal.timeout(1000)).run([
    'access',
    'me',
    '--input',
    '{"input":{}}',
  ]);
  expect(process.exitCode).toBe(3);
  expect(stdout).toEqual([]);
  expect(stderr.join('')).toContain('token_expired');
  expect(stderr.join('')).not.toContain('revoked-refresh-secret');
});

it('allows a public password-reset request from a fresh CLI without loading or forwarding an account token', async () => {
  const { stdout, stderr, cfg } = await setup();
  const { token: _token, ...withoutToken } = cfg;
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetcher);
  await createCli(withoutToken, AbortSignal.timeout(1000)).run([
    'identity',
    'request-password-reset',
    '--input',
    '{"input":{"email":"owner@example.test"}}',
  ]);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization')).toBeNull();
  expect(JSON.parse(stdout.join('')) as unknown).toMatchObject({ ok: true });
  expect(stderr).toEqual([]);
});

it.each(['login', 'logout'])(
  'refuses auth %s while an environment token would override the managed profile',
  async (command) => {
    const { app, stdout, stderr } = await setup();
    process.exitCode = 0;
    await app.run(['auth', command]);
    expect(process.exitCode).toBe(2);
    expect(stdout).toEqual([]);
    expect(stderr.join('')).toContain('CMS_ACCESS_TOKEN');
    expect(stderr.join('')).not.toContain('sensitive-token');
  },
);
it('regression: CLI JSON editorSessionId is transported as context and is absent from the document body', async () => {
  const { app, stdout, stderr } = await setup();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ revision: 2 }));
  vi.stubGlobal('fetch', fetcher);
  const editorSessionId = 'ABCDEFAB-1234-4123-8123-ABCDEFABCDEF';
  await app.run([
    'documents',
    'update',
    '--input',
    JSON.stringify({
      editorSessionId,
      input: {
        collection: 'articles',
        id: '11111111-1111-4111-8111-111111111111',
        revision: 1,
        data: { title: 'Editor' },
      },
    }),
  ]);
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('x-cms-editor-session')).toBe(
    editorSessionId.toLowerCase(),
  );
  expect(JSON.parse(z.string().parse(fetcher.mock.calls[0]?.[1]?.body)) as unknown).toEqual({
    revision: 1,
    data: { title: 'Editor' },
  });
  expect(JSON.parse(stdout.join('')) as unknown).toMatchObject({ ok: true, data: { revision: 2 } });
  expect(stderr).toEqual([]);
});
