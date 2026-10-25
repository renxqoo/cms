import { createTestStorage } from '../test/support/temporary-storage.ts';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { createTestRuntimeDatabase } from '../test/support/runtime-database.ts';
import { createTestSmtp, extractToken } from '../test/support/smtp.ts';
import { nodeExecutable } from '../test/support/node-runtime.ts';
import { runCommand, startProcess } from '../test/support/process.ts';
import { createCmsProcess } from '../test/support/cms-process.ts';

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
    const store = await createTestRuntimeDatabase();
    const smtp = await createTestSmtp();
    let storage: Awaited<ReturnType<typeof createTestStorage>> | undefined;
    let server: Awaited<ReturnType<typeof startProcess>> | undefined;
    try {
      storage = await createTestStorage();
      const binary = mode === 'bun' ? process.execPath : nodeExecutable();
      const folder = mode === 'bun' ? 'apps/api/src' : 'apps/api/dist';
      const extension = mode === 'bun' ? 'ts' : 'js';
      const env = {
        ...process.env,
        DATABASE_URL: store.runtimeConnectionString,
        CMS_MIGRATION_DATABASE_URL: store.connectionString,
        CMS_DATABASE_RUNTIME_ROLE: store.roleName,
        DATABASE_SCHEMA: store.schema,
        CMS_RATE_LIMIT_SECRET: 'network-test-secret-for-an-isolated-postgresql-schema',
        API_HOST: '127.0.0.1',
        API_PORT: '0',
        NODE_ENV: 'test',
        CMS_STORAGE_DRIVER: 'local',
        CMS_STORAGE_ROOT: storage.root,
        SMTP_HOST: smtp.host,
        SMTP_PORT: String(smtp.port),
        SMTP_SECURE: 'false',
        CMS_NAVIGATION_PATHS: '/network-dashboard',
        CMS_NAVIGATION_ICONS: 'home',
      };
      runCommand(binary, `${folder}/commands/migrate.${extension}`, { env });
      runCommand(binary, `${folder}/commands/reconcile-operations.${extension}`, { env });
      runCommand(binary, `${folder}/commands/grant-runtime-role.${extension}`, { env });
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
      const groupResult = await request(server.port)('POST', '/v1/navigation', {
        ...owner,
        body: { type: 'group', name: 'Network workspace', visibility: 'container' },
      });
      expect(groupResult.status).toBe(201);
      const group = z.object({ id: z.uuid() }).parse(await groupResult.json());
      const pageResult = await request(server.port)('POST', '/v1/navigation', {
        ...owner,
        body: {
          type: 'page',
          name: 'Network dashboard',
          parentId: group.id,
          path: '/network-dashboard',
          icon: 'home',
          visibility: 'permission',
          permissionId: grant.id,
        },
      });
      expect(pageResult.status).toBe(201);
      const page = z.object({ id: z.uuid() }).parse(await pageResult.json());
      const actionResult = await request(server.port)('POST', '/v1/navigation', {
        ...owner,
        body: {
          type: 'action',
          name: 'Network preview',
          parentId: page.id,
          visibility: 'authenticated',
        },
      });
      expect(actionResult.status).toBe(201);
      const action = z.object({ id: z.uuid() }).parse(await actionResult.json());
      const bodyOnly = await request(server.port)('DELETE', `/v1/navigation/${action.id}`, {
        ...owner,
        body: { version: 1 },
      });
      expect(bodyOnly.status).toBe(400);
      const problem = z
        .object({
          error: z.object({
            fieldErrors: z.array(z.object({ field: z.string(), message: z.string() })),
          }),
        })
        .parse(await bodyOnly.json());
      expect(
        problem.error.fieldErrors.find((entry) => entry.field === 'version')?.message,
      ).toContain('?version=');
      expect(
        (await request(server.port)('DELETE', `/v1/navigation/${action.id}?version=1`, owner))
          .status,
      ).toBe(204);
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
      expect(
        await (await request(server.port)('GET', '/v1/me/navigation', editor)).json(),
      ).toMatchObject({
        rows: [{ id: group.id, children: [{ id: page.id, path: '/network-dashboard' }] }],
      });
      expect((await request(server.port)('GET', '/v1/admins', editor)).status).toBe(200);
      expect(
        (await request(server.port)('GET', '/v1/security/recovery?resource=bindings', editor))
          .status,
      ).toBe(403);
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
      expect(await (await request(server.port)('GET', '/v1/me/navigation', editor)).json()).toEqual(
        { rows: [] },
      );
      expect((await request(server.port)('POST', '/v1/auth/logout', editor)).status).toBe(204);
      expect((await request(server.port)('GET', '/v1/me', editor)).status).toBe(401);
      expect(
        (await request(server.port)('GET', '/v1/security/recovery?resource=bindings', editor))
          .status,
      ).toBe(401);
      await store.database.query('DROP TABLE rate_limit_buckets');
      expect((await request(server.port)('GET', '/livez')).status).toBe(200);
      expect((await request(server.port)('GET', '/readyz')).status).toBe(503);
      expect(server.output()).not.toContain(owner.token);
      await server.close();
      server = undefined;
    } finally {
      await server?.close();
      await smtp.close();
      await store.close();
      await storage?.close();
    }
  },
);

const recoveryBinding = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  permissionId: z.uuid(),
});
const recoveryEndpoint = z.object({
  resource: z.literal('endpoints'),
  total: z.literal(1),
  rows: z.tuple([
    z.object({
      operationId: z.string(),
      scopeKind: z.literal('global'),
      collectionKey: z.null(),
      accessKind: z.string(),
      bindingConfigurable: z.boolean(),
      binding: recoveryBinding.nullable(),
    }),
  ]),
});
const recoveryPermission = z.object({
  resource: z.literal('permissions'),
  total: z.literal(1),
  rows: z.tuple([
    z.object({
      id: z.uuid(),
      version: z.number().int().positive(),
      code: z.string(),
      status: z.enum(['active', 'disabled']),
    }),
  ]),
});

it.each(['bun', 'node'] as const)(
  '%s recovers broken RBAC reads after refresh without weakening ordinary authorization',
  async (mode) => {
    const kit = await createCmsProcess(mode);
    const { request: recoveryRequest, owner } = kit;
    try {
      const endpointPath = '/v1/security/recovery?resource=endpoints&operationId=endpoints.list';
      const originalResponse = await recoveryRequest('GET', endpointPath, owner);
      expect(originalResponse.status).toBe(200);
      const original = recoveryEndpoint.parse(await originalResponse.json());
      const {
        rows: [{ binding }],
      } = original;
      if (!binding) throw new Error('Initial endpoint read binding is missing');
      expect(
        (
          await recoveryRequest(
            'DELETE',
            `/v1/endpoint-bindings/${binding.id}?version=${binding.version}`,
            owner,
          )
        ).status,
      ).toBe(204);
      expect((await recoveryRequest('GET', '/v1/endpoints', owner)).status).toBe(403);
      await kit.restart();
      const unbound = await recoveryRequest('GET', endpointPath, owner);
      expect(unbound.status).toBe(200);
      expect(recoveryEndpoint.parse(await unbound.json()).rows[0]).toMatchObject({
        operationId: 'endpoints.list',
        binding: null,
      });
      const rebound = await recoveryRequest('POST', '/v1/endpoint-bindings', {
        ...owner,
        body: {
          operationId: 'endpoints.list',
          scopeKind: 'global',
          collectionKey: null,
          permissionId: binding.permissionId,
        },
      });
      expect(rebound.status).toBe(201);
      expect((await recoveryRequest('GET', '/v1/endpoints', owner)).status).toBe(200);

      const permissionPath = '/v1/security/recovery?resource=permissions&code=permissions%3Aread';
      const permissionResponse = await recoveryRequest('GET', permissionPath, owner);
      expect(permissionResponse.status).toBe(200);
      const {
        rows: [permission],
      } = recoveryPermission.parse(await permissionResponse.json());
      const disabledResponse = await recoveryRequest('PATCH', `/v1/permissions/${permission.id}`, {
        ...owner,
        body: { version: permission.version, status: 'disabled' },
      });
      expect(disabledResponse.status).toBe(200);
      expect((await recoveryRequest('GET', '/v1/permissions', owner)).status).toBe(403);
      const disabledRead = await recoveryRequest('GET', permissionPath, owner);
      expect(disabledRead.status).toBe(200);
      const {
        rows: [disabled],
      } = recoveryPermission.parse(await disabledRead.json());
      expect(disabled).toMatchObject({ id: permission.id, status: 'disabled' });
      expect(disabled.version).toBeGreaterThan(permission.version);
      const stale = await recoveryRequest('PATCH', `/v1/permissions/${permission.id}`, {
        ...owner,
        body: { version: permission.version, status: 'active' },
      });
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ error: { code: 'version_conflict' } });
      const enabledResponse = await recoveryRequest('PATCH', `/v1/permissions/${permission.id}`, {
        ...owner,
        body: { version: disabled.version, status: 'active' },
      });
      expect(enabledResponse.status).toBe(200);
      const enabled = z
        .object({ version: z.number().int().positive() })
        .parse(await enabledResponse.json());
      expect((await recoveryRequest('GET', '/v1/permissions', owner)).status).toBe(200);
      const referencedDelete = await recoveryRequest(
        'DELETE',
        `/v1/permissions/${permission.id}?version=${enabled.version}`,
        owner,
      );
      expect(referencedDelete.status).toBe(409);
      expect(await referencedDelete.json()).toMatchObject({ error: { code: 'resource_in_use' } });
      const bindingResponse = await recoveryRequest(
        'GET',
        `/v1/security/recovery?resource=bindings&permissionId=${permission.id}`,
        owner,
      );
      expect(bindingResponse.status).toBe(200);
      const referencing = z
        .object({ resource: z.literal('bindings'), rows: z.array(recoveryBinding) })
        .parse(await bindingResponse.json());
      expect(referencing.rows).toHaveLength(1);
      for (const current of referencing.rows) {
        expect(
          (
            await recoveryRequest(
              'DELETE',
              `/v1/endpoint-bindings/${current.id}?version=${current.version}`,
              owner,
            )
          ).status,
        ).toBe(204);
      }
      expect(
        (
          await recoveryRequest(
            'DELETE',
            `/v1/permissions/${permission.id}?version=${enabled.version}`,
            owner,
          )
        ).status,
      ).toBe(204);
      expect((await recoveryRequest('GET', '/v1/permissions', owner)).status).toBe(403);
      await kit.restart();
      const missing = await recoveryRequest('GET', permissionPath, owner);
      expect(missing.status).toBe(200);
      expect(await missing.json()).toMatchObject({ total: 0, rows: [] });
      const recreated = await recoveryRequest('POST', '/v1/permissions', {
        ...owner,
        body: { code: 'permissions:read', name: 'Recovered read', scopeKind: 'global' },
      });
      expect(recreated.status).toBe(201);
      const newPermission = z.object({ id: z.uuid() }).parse(await recreated.json());
      expect(newPermission.id).not.toBe(permission.id);
      const bindingRequest = {
        ...owner,
        key: randomUUID(),
        body: {
          operationId: 'permissions.list',
          scopeKind: 'global',
          permissionId: newPermission.id,
        },
      };
      const createdBindingResponse = await recoveryRequest(
        'POST',
        '/v1/endpoint-bindings',
        bindingRequest,
      );
      expect(createdBindingResponse.status).toBe(201);
      const createdBinding = recoveryBinding.parse(await createdBindingResponse.json());
      const replay = await recoveryRequest('POST', '/v1/endpoint-bindings', bindingRequest);
      expect(replay.status).toBe(201);
      expect(recoveryBinding.parse(await replay.json()).id).toBe(createdBinding.id);
      expect((await recoveryRequest('GET', '/v1/permissions', owner)).status).toBe(200);
      const securityRead = await recoveryRequest(
        'GET',
        '/v1/security/recovery?resource=endpoints&operationId=access.readRecovery',
        owner,
      );
      expect(securityRead.status).toBe(200);
      expect(recoveryEndpoint.parse(await securityRead.json()).rows[0]).toMatchObject({
        operationId: 'access.readRecovery',
        accessKind: 'security',
        bindingConfigurable: false,
        binding: null,
      });
      expect((await recoveryRequest('POST', '/v1/auth/logout', owner)).status).toBe(204);
      expect((await recoveryRequest('GET', endpointPath, owner)).status).toBe(401);
    } finally {
      await kit.close();
    }
  },
);
