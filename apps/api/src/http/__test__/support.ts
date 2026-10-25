import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestSmtp } from '../../../../../test/support/smtp.ts';
import { createRuntime } from '../../bootstrap/create-runtime.ts';
import { loadConfig } from '../../bootstrap/load-config.ts';

export const administratorPassword = 'A safe test password 2026';

export async function createHttpFixture() {
  const store = await createTestDatabase();
  const smtp = await createTestSmtp();
  const storage = await mkdtemp(join(tmpdir(), 'cms-http-assets-'));
  const config = loadConfig({
    DATABASE_URL: store.connectionString,
    DATABASE_SCHEMA: store.schema,
    CMS_RATE_LIMIT_SECRET: 'test-only-secret-used-by-an-isolated-database-schema',
    SMTP_HOST: smtp.host,
    SMTP_PORT: String(smtp.port),
    SMTP_SECURE: 'false',
    NODE_ENV: 'test',
    CMS_STORAGE_ROOT: storage,
  });
  const runtime = createRuntime(config);
  try {
    await runtime.access.reconcile();
    const admin = await runtime.access.initializeAdmin({
      email: 'owner@example.test',
      password: administratorPassword,
    });
    const response = await runtime.app.request('http://localhost/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: admin.email, password: administratorPassword }),
    });
    const login = z.object({ token: z.string() }).parse(await response.json());
    return {
      runtime,
      smtp,
      config,
      store,
      admin,
      token: login.token,
      close: async () => {
        await runtime.close();
        await smtp.close();
        await store.close();
        await rm(storage, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await runtime.close();
    await smtp.close();
    await store.close();
    await rm(storage, { recursive: true, force: true });
    throw error;
  }
}

export type HttpFixture = Awaited<ReturnType<typeof createHttpFixture>>;

export function api(fixture: HttpFixture) {
  return (
    method: string,
    path: string,
    options: {
      token?: string | null;
      body?: unknown;
      key?: string;
    } = {},
  ) => {
    const headers = new Headers({
      'content-type': 'application/json',
      'idempotency-key': options.key ?? randomUUID(),
    });
    const token = options.token === undefined ? fixture.token : options.token;
    if (token !== null) headers.set('authorization', `Bearer ${token}`);
    return fixture.runtime.app.request(`http://localhost${path}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  };
}

export async function errorCode(response: Response): Promise<string> {
  const result = z
    .object({ error: z.object({ code: z.string(), requestId: z.uuid() }) })
    .parse(await response.json());
  return result.error.code;
}

export function mailToken(raw: string): string {
  const decoded = raw
    .replaceAll(/=\r?\n/g, '')
    .replaceAll(/=([0-9A-F]{2})/g, (_value, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  const match = /#token=([A-Za-z0-9_-]{43})/.exec(decoded);
  if (!match?.[1]) throw new Error('Expected invitation fragment');
  return match[1];
}
