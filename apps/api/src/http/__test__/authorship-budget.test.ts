import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { bindOperations } from '../../../../../test/support/cms-api.ts';
import { collections } from '../../config/collections/index.ts';
import { api, createHttpFixture, mailToken } from './support.ts';
import type { HttpFixture } from './support.ts';

const fixtures: HttpFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
const catalog = z.object({
  rows: z.array(z.object({ key: z.string(), authorship: z.object({ queryable: z.boolean() }) })),
});

it('lists all application collections with author permissions within the request budget and observes revocation on the next request', async () => {
  const kit = await createHttpFixture();
  fixtures.push(kit);
  const request = api(kit);
  const permissionIds: string[] = [];
  for (const collection of collections) {
    permissionIds.push(
      await bindOperations(request, {
        token: kit.token,
        collection: collection.key,
        code: `catalog:${collection.key}`,
        operations: ['collections.get'],
      }),
    );
  }
  const permissions = z
    .object({ rows: z.array(z.object({ id: z.uuid(), code: z.string() })) })
    .parse(await (await request('GET', '/v1/permissions?pageSize=100')).json());
  const authorRead = permissions.rows.find((row) => row.code === 'admins:read');
  if (!authorRead) throw new Error('Missing author directory permission');
  const roleResponse = await request('POST', '/v1/roles', {
    body: {
      code: 'catalog_reader',
      name: 'Catalog reader',
      permissionIds: [...permissionIds, authorRead.id],
    },
  });
  expect(roleResponse.status).toBe(201);
  const role = z.object({ id: z.uuid(), version: z.number() }).parse(await roleResponse.json());
  const account = await request('POST', '/v1/admins', {
    body: { email: 'catalog-reader@example.test', roleId: role.id },
  });
  expect(account.status).toBe(201);
  const activation = await request('POST', '/v1/auth/invitation-acceptances', {
    token: null,
    body: {
      token: mailToken(await kit.smtp.waitForMessage()),
      newPassword: 'Catalog reader safe password 2026',
    },
  });
  expect(activation.status).toBe(204);
  const login = await request('POST', '/v1/auth/login', {
    token: null,
    body: { email: 'catalog-reader@example.test', password: 'Catalog reader safe password 2026' },
  });
  expect(login.status).toBe(200);
  const reader = z.object({ token: z.string() }).parse(await login.json());
  const response = await request('GET', '/v1/collections', reader);
  const body: unknown = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  expect(catalog.parse(body).rows).toHaveLength(12);
  expect(catalog.parse(body).rows.every((row) => row.authorship.queryable)).toBe(true);
  const revoked = await request('PUT', `/v1/roles/${role.id}/permissions`, {
    body: { version: role.version, permissionIds },
  });
  expect(revoked.status).toBe(200);
  const next = await request('GET', '/v1/collections', reader);
  expect(next.status).toBe(200);
  const nextCatalog = catalog.parse(await next.json());
  expect(nextCatalog.rows).toHaveLength(12);
  expect(nextCatalog.rows.every((row) => !row.authorship.queryable)).toBe(true);
});
