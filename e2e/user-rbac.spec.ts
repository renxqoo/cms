import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { createTestDatabase } from '../test/support/database.ts';
import { createTestSmtp } from '../test/support/smtp.ts';
import { nodeExecutable } from '../test/support/node-runtime.ts';
import { runCommand, startProcess } from '../test/support/process.ts';

function extractToken(raw: string): string {
  const decoded = raw
    .replaceAll(/=\r?\n/g, '')
    .replaceAll(/=([0-9A-F]{2})/g, (_value, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  const result = /#token=([A-Za-z0-9_-]{43})/.exec(decoded)?.[1];
  if (!result) throw new Error('SMTP message had no token fragment');
  return result;
}

function request(port: number) {
  return (method: string, path: string, options: { token?: string; body?: unknown } = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      signal: AbortSignal.timeout(10000),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
}

it.each(['bun', 'node'] as const)(
  '%s serves the real invitation, authorization, revocation and shutdown journey',
  async (mode) => {
    const store = await createTestDatabase();
    const smtp = await createTestSmtp();
    const binary = mode === 'bun' ? process.execPath : nodeExecutable();
    const folder = mode === 'bun' ? 'apps/api/src' : 'apps/api/dist';
    const extension = mode === 'bun' ? 'ts' : 'js';
    const env = {
      ...process.env,
      DATABASE_URL: store.connectionString,
      DATABASE_SCHEMA: store.schema,
      CMS_RATE_LIMIT_SECRET: 'network-test-secret-for-an-isolated-postgresql-schema',
      API_HOST: '127.0.0.1',
      API_PORT: '0',
      NODE_ENV: 'test',
      SMTP_HOST: smtp.host,
      SMTP_PORT: String(smtp.port),
      SMTP_SECURE: 'false',
    };
    let server: Awaited<ReturnType<typeof startProcess>> | undefined;
    try {
      runCommand(binary, `${folder}/commands/migrate.${extension}`, { env });
      runCommand(binary, `${folder}/commands/reconcile-operations.${extension}`, { env });
      runCommand(binary, `${folder}/commands/initialize-admin.${extension}`, {
        env,
        args: ['--email', 'network-owner@example.test'],
        input: 'Network owner password 2026\n',
      });
      server = await startProcess(binary, `${folder}/main.${extension}`, env);
      const ownerLogin = await request(server.port)('POST', '/v1/auth/login', {
        body: { email: 'network-owner@example.test', password: 'Network owner password 2026' },
      });
      expect(ownerLogin.status).toBe(200);
      const owner = z.object({ token: z.string() }).parse(await ownerLogin.json());
      const list = await request(server.port)('GET', '/v1/permissions', owner);
      const permissions = z
        .object({ rows: z.array(z.object({ id: z.uuid(), code: z.string() })) })
        .parse(await list.json());
      const grant = permissions.rows.find((row) => row.code === 'admins:read');
      if (!grant) throw new Error('Missing initial read permission');
      const roleResult = await request(server.port)('POST', '/v1/roles', {
        ...owner,
        body: { code: 'network_reader', name: 'Network reader', permissionIds: [grant.id] },
      });
      const role = z.object({ id: z.uuid(), version: z.number() }).parse(await roleResult.json());
      expect(
        (
          await request(server.port)('POST', '/v1/admins', {
            ...owner,
            body: { email: 'network-editor@example.test', roleId: role.id },
          })
        ).status,
      ).toBe(201);
      const token = extractToken(await smtp.waitForMessage());
      expect(
        (
          await request(server.port)('POST', '/v1/auth/invitation-acceptances', {
            body: { token, newPassword: 'Network editor password 2026' },
          })
        ).status,
      ).toBe(204);
      const editorResult = await request(server.port)('POST', '/v1/auth/login', {
        body: { email: 'network-editor@example.test', password: 'Network editor password 2026' },
      });
      const editor = z.object({ token: z.string() }).parse(await editorResult.json());
      expect((await request(server.port)('GET', '/v1/admins', editor)).status).toBe(200);
      expect(
        (
          await request(server.port)('POST', '/v1/roles', {
            ...editor,
            body: { code: 'attack', name: 'Attack' },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(server.port)('PUT', `/v1/roles/${role.id}/permissions`, {
            ...owner,
            body: { version: role.version, permissionIds: [] },
          })
        ).status,
      ).toBe(200);
      expect((await request(server.port)('GET', '/v1/admins', editor)).status).toBe(403);
      expect((await request(server.port)('POST', '/v1/auth/logout', editor)).status).toBe(204);
      expect((await request(server.port)('GET', '/v1/me', editor)).status).toBe(401);
      expect(server.output()).not.toContain(owner.token);
      await server.close();
      server = undefined;
    } finally {
      await server?.close();
      await smtp.close();
      await store.close();
    }
  },
);
