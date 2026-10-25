import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { recoveryPageSchema } from '@new-cms/cms/access';
import { api, createHttpFixture, mailToken } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

it('finds the missing endpoints read binding through recovery after the ordinary directory rejects', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  const directory = z
    .object({
      rows: z.array(
        z.object({
          operationId: z.string(),
          binding: z
            .object({ id: z.uuid(), permissionId: z.uuid(), version: z.number() })
            .nullable(),
        }),
      ),
    })
    .parse(await (await client('GET', '/v1/endpoints?module=access&pageSize=100')).json());
  const endpoint = directory.rows.find((row) => row.operationId === 'endpoints.list');
  if (!endpoint?.binding) throw new Error('Expected endpoints read binding');
  const deleted = await client('DELETE', `/v1/endpoint-bindings/${endpoint.binding.id}?version=1`);
  expect(deleted.status).toBe(204);
  expect((await client('GET', '/v1/endpoints')).status).toBe(403);
  expect((await client('GET', '/openapi.json')).status).toBe(403);
  const recovery = await client(
    'GET',
    '/v1/security/recovery?resource=endpoints&operationId=endpoints.list',
  );
  expect(recovery.status).toBe(200);
  expect(await recovery.json()).toMatchObject({
    resource: 'endpoints',
    total: 1,
    rows: [{ operationId: 'endpoints.list', binding: null }],
  });
  const restored = await client('POST', '/v1/endpoint-bindings', {
    body: {
      operationId: 'endpoints.list',
      scopeKind: 'global',
      permissionId: endpoint.binding.permissionId,
    },
  });
  expect(restored.status).toBe(201);
  expect((await client('GET', '/v1/endpoints')).status).toBe(200);
});

it('discovers a disabled read permission and restores ordinary reads with current CAS data', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  const permissionPage = recoveryPageSchema.parse(
    await (
      await client('GET', '/v1/security/recovery?resource=permissions&code=permissions:read')
    ).json(),
  );
  if (permissionPage.resource !== 'permissions') throw new Error('Expected permission page');
  const [permission] = permissionPage.rows;
  if (!permission) throw new Error('Expected seeded read permission');
  const disabled = await client('PATCH', `/v1/permissions/${permission.id}`, {
    body: { version: permission.version, status: 'disabled' },
  });
  expect(disabled.status).toBe(200);
  expect((await client('GET', '/v1/permissions')).status).toBe(403);
  const recovery = recoveryPageSchema.parse(
    await (
      await client('GET', `/v1/security/recovery?resource=permissions&id=${permission.id}`)
    ).json(),
  );
  expect(recovery).toMatchObject({
    resource: 'permissions',
    total: 1,
    rows: [{ id: permission.id, status: 'disabled', version: permission.version + 1 }],
  });
  const stale = await client('PATCH', `/v1/permissions/${permission.id}`, {
    body: { version: permission.version, status: 'active' },
  });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ error: { code: 'version_conflict' } });
  const enabled = await client('PATCH', `/v1/permissions/${permission.id}`, {
    body: { version: permission.version + 1, status: 'active' },
  });
  expect(enabled.status).toBe(200);
  expect((await client('GET', '/v1/permissions')).status).toBe(200);
});

async function ordinaryActor(kit: HttpFixture) {
  const client = api(kit);
  const role = z.object({ id: z.uuid() }).parse(
    await (
      await client('POST', '/v1/roles', {
        body: { code: 'recovery_reader', name: 'Ordinary reader' },
      })
    ).json(),
  );
  const email = 'ordinary-recovery-reader@example.test';
  const created = await client('POST', '/v1/admins', { body: { email, roleId: role.id } });
  expect(created.status).toBe(201);
  const password = 'Recovery actor password 2026';
  const activated = await client('POST', '/v1/auth/invitation-acceptances', {
    token: null,
    body: { token: mailToken(await kit.smtp.waitForMessage()), newPassword: password },
  });
  expect(activated.status).toBe(204);
  return z
    .object({ token: z.string() })
    .parse(
      await (
        await client('POST', '/v1/auth/login', { token: null, body: { email, password } })
      ).json(),
    );
}

it('keeps recovery super-only and cannot turn its security identity into a configurable binding', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  const actor = await ordinaryActor(kit);
  const path = '/v1/security/recovery?resource=permissions';
  const ordinary = await client('GET', path, { token: actor.token });
  expect(ordinary.status).toBe(403);
  expect(await ordinary.json()).toMatchObject({ error: { code: 'forbidden' } });
  for (const token of [null, 'invalid']) {
    const response = await client('GET', path, { token });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  }
  const permissions = recoveryPageSchema.parse(await (await client('GET', path)).json());
  const [permission] = permissions.rows;
  if (!permission || !('id' in permission)) throw new Error('Expected real permission');
  const bound = await client('POST', '/v1/endpoint-bindings', {
    body: {
      operationId: 'access.readRecovery',
      scopeKind: 'global',
      permissionId: permission.id,
    },
  });
  expect(bound.status).toBe(400);
  expect(await bound.json()).toMatchObject({ error: { code: 'invalid_input' } });
  expect((await client('POST', '/v1/auth/logout', { token: actor.token })).status).toBe(204);
  expect((await client('GET', path, { token: actor.token })).status).toBe(401);
});

it('pages each resource with exact filters and preserves totals on empty pages', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  for (const query of [
    'resource=endpoints&operationId=endpoints.list',
    'resource=bindings&operationId=endpoints.list',
    'resource=permissions&code=endpoints:read',
  ]) {
    const response = await client('GET', `/v1/security/recovery?${query}&pageSize=1`);
    expect(response.status).toBe(200);
    const page = recoveryPageSchema.parse(await response.json());
    expect(page.rows).toHaveLength(1);
    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    const empty = await client('GET', `/v1/security/recovery?${query}&pageSize=1&page=2`);
    expect(empty.status).toBe(200);
    expect(recoveryPageSchema.parse(await empty.json())).toMatchObject({
      rows: [],
      total: 1,
      page: 2,
      pageSize: 1,
    });
  }
  const scoped = await client(
    'GET',
    '/v1/security/recovery?resource=endpoints&operationId=documents.get&scopeKind=collection&collectionKey=articles',
  );
  expect(scoped.status).toBe(200);
  expect(recoveryPageSchema.parse(await scoped.json())).toMatchObject({
    resource: 'endpoints',
    total: 1,
    rows: [{ operationId: 'documents.get', scopeKind: 'collection', collectionKey: 'articles' }],
  });
});

it('reports strict query field errors without changing ordinary query error envelopes', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  const cases = [
    ['', 'resource'],
    ['resource=unknown', 'resource'],
    ['resource=endpoints&resource=bindings', 'resource'],
    ['resource=endpoints&page=1&page=2', 'page'],
    ['resource=permissions&status=active&status=disabled', 'status'],
    ['resource=endpoints&page=0', 'page'],
    ['resource=endpoints&page=-1', 'page'],
    ['resource=endpoints&page=01', 'page'],
    ['resource=endpoints&page=1.0', 'page'],
    ['resource=endpoints&page=1e2', 'page'],
    ['resource=endpoints&page=%2B1', 'page'],
    ['resource=endpoints&page=%20', 'page'],
    ['resource=endpoints&page=', 'page'],
    ['resource=endpoints&page=9007199254740992', 'page'],
    ['resource=endpoints&page=9007199254740991&pageSize=100', 'page'],
    ['resource=endpoints&pageSize=0', 'pageSize'],
    ['resource=endpoints&pageSize=101', 'pageSize'],
    ['resource=endpoints&pageSize=1&pageSize=2', 'pageSize'],
    ['resource=bindings&id=invalid', 'id'],
    ['resource=bindings&permissionId=invalid', 'permissionId'],
    ['resource=permissions&module=access', 'module'],
    ['resource=endpoints&status=disabled', 'status'],
    ['resource=endpoints&scopeKind=unknown', 'scopeKind'],
    ['resource=endpoints&collectionKey=articles', 'collectionKey'],
    ['resource=endpoints&scopeKind=global&collectionKey=articles', 'collectionKey'],
    ['resource=endpoints&__proto__=unexpected', '__proto__'],
    ['resource=endpoints&where=%7B%7D', 'where'],
  ];
  for (const [query, field] of cases) {
    const response = await client('GET', `/v1/security/recovery?${query}`);
    expect(response.status).toBe(400);
    const problem = z
      .object({
        error: z.object({
          code: z.literal('invalid_input'),
          fieldErrors: z.array(z.object({ field: z.string(), message: z.string().min(1) })),
        }),
      })
      .parse(await response.json());
    expect(problem.error.fieldErrors.map((issue) => issue.field)).toContain(field);
  }
  const ordinary = await client('GET', '/v1/endpoints?page=1&page=2');
  expect(ordinary.status).toBe(400);
  const error = z.object({ error: z.record(z.string(), z.unknown()) }).parse(await ordinary.json());
  expect(error.error).not.toHaveProperty('fieldErrors');
  expect(ordinary.headers.get('cache-control')).toBe('no-store');
});

it('serves authenticated HEAD and private recovery reads without idempotency or business writes', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const before = await kit.store.database.query<{ audit: string; idempotency: string }>(
    'SELECT (SELECT count(*) FROM audit_events)::text AS audit,(SELECT count(*) FROM idempotency_records)::text AS idempotency',
  );
  const request = (method: string) =>
    kit.runtime.app.request(
      'http://localhost/v1/security/recovery?resource=endpoints&operationId=access.readRecovery',
      { method, headers: { authorization: `Bearer ${kit.token}` } },
    );
  const read = await request('GET');
  const head = await request('HEAD');
  for (const response of [read, head]) {
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
  }
  expect(await head.text()).toBe('');
  const denied = await api(kit)('HEAD', '/v1/security/recovery?resource=endpoints', {
    token: null,
  });
  expect(denied.status).toBe(401);
  expect(denied.headers.get('cache-control')).toBe('private, no-store');
  expect(await denied.text()).toBe('');
  const after = await kit.store.database.query<{ audit: string; idempotency: string }>(
    'SELECT (SELECT count(*) FROM audit_events)::text AS audit,(SELECT count(*) FROM idempotency_records)::text AS idempotency',
  );
  expect(after.rows).toEqual(before.rows);
  expect((await api(kit)('GET', '/v1/me')).headers.get('cache-control')).toBe('no-store');
});

it('publishes the resource discriminator and matching strict response branches in served OpenAPI', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const response = await api(kit)('GET', '/openapi.json');
  expect(response.status).toBe(200);
  const spec = z
    .object({
      paths: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.unknown()))),
      components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
    })
    .parse(await response.json());
  const operation = spec.paths['/v1/security/recovery']?.['get'];
  expect(operation).toMatchObject({
    operationId: 'access.readRecovery',
    'x-access-kind': 'security',
    'x-scope-kind': 'global',
    'x-binding-configurable': false,
    responses: {
      '200': {
        content: { 'application/json': { schema: { $ref: '#/components/schemas/RecoveryPage' } } },
      },
    },
  });
  expect(operation).not.toHaveProperty('requestBody');
  const parameters = z
    .array(z.object({ name: z.string(), required: z.boolean(), schema: z.unknown() }))
    .parse(operation?.['parameters']);
  expect(parameters.find((parameter) => parameter.name === 'resource')).toMatchObject({
    required: true,
    schema: { anyOf: [{ const: 'endpoints' }, { const: 'bindings' }, { const: 'permissions' }] },
  });
  expect(parameters.map((parameter) => parameter.name)).not.toContain('Idempotency-Key');
  const querySchema = z
    .object({ oneOf: z.array(z.object({ required: z.array(z.string()) })) })
    .parse(operation?.['x-query-schema']);
  expect(querySchema.oneOf).toHaveLength(3);
  for (const branch of querySchema.oneOf) expect(branch.required).toContain('resource');
  const output = z
    .object({
      oneOf: z.array(
        z.object({
          additionalProperties: z.literal(false),
          properties: z.object({
            resource: z.object({ const: z.string() }),
            rows: z.object({
              items: z.object({
                additionalProperties: z.literal(false),
                required: z.array(z.string()),
                properties: z.record(z.string(), z.unknown()),
              }),
            }),
          }),
        }),
      ),
    })
    .parse(spec.components.schemas['RecoveryPage']);
  for (const resource of ['endpoints', 'bindings', 'permissions']) {
    const page = recoveryPageSchema.parse(
      await (await api(kit)('GET', `/v1/security/recovery?resource=${resource}&pageSize=1`)).json(),
    );
    const [row] = page.rows;
    const schema = output.oneOf.find((branch) => branch.properties.resource.const === resource)
      ?.properties.rows.items;
    if (!row || !schema) throw new Error('Expected documented response branch');
    expect(Object.keys(row).filter((key) => !Object.hasOwn(schema.properties, key))).toEqual([]);
    expect(schema.required.filter((key) => !Object.hasOwn(row, key))).toEqual([]);
  }
});
