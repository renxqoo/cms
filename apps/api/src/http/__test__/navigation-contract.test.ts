import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { api, createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const entity = z.object({ id: z.uuid() });
const error = z.object({
  error: z.object({
    code: z.string(),
    fieldErrors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  }),
});

it('uses configured navigation targets in the real application runtime to create pages and actions', async () => {
  fixture = await createHttpFixture({
    CMS_NAVIGATION_PATHS: '/dashboard,/reports',
    CMS_NAVIGATION_ICONS: 'home,chart',
  });
  const groupResponse = await api(fixture)('POST', '/v1/navigation', {
    body: { type: 'group', name: 'Workspace', visibility: 'container' },
  });
  expect(groupResponse.status).toBe(201);
  const group = entity.parse(await groupResponse.json());
  const pageInput = {
    type: 'page',
    name: 'Dashboard',
    parentId: group.id,
    path: '/dashboard',
    icon: 'home',
    visibility: 'authenticated',
  };
  const pageResponse = await api(fixture)('POST', '/v1/navigation', { body: pageInput });
  expect(pageResponse.status).toBe(201);
  const page = entity.parse(await pageResponse.json());
  const actionResponse = await api(fixture)('POST', '/v1/navigation', {
    body: { type: 'action', name: 'Preview', parentId: page.id, visibility: 'authenticated' },
  });
  expect(actionResponse.status).toBe(201);
  const action = entity.parse(await actionResponse.json());
  expect(await (await api(fixture)('GET', '/v1/me/navigation')).json()).toMatchObject({
    rows: [
      {
        id: group.id,
        children: [
          {
            id: page.id,
            path: '/dashboard',
            icon: 'home',
            children: [{ id: action.id, path: null }],
          },
        ],
      },
    ],
  });
  const unknownPath = await api(fixture)('POST', '/v1/navigation', {
    body: { ...pageInput, path: '/unregistered' },
  });
  expect(unknownPath.status).toBe(400);
  const unknownPathProblem = error.parse(await unknownPath.json()).error;
  expect(
    unknownPathProblem.fieldErrors?.find((entry) => entry.field === 'path')?.message,
  ).toContain('not registered');
  const unknownIcon = await api(fixture)('POST', '/v1/navigation', {
    body: { ...pageInput, path: '/reports', icon: 'unregistered' },
  });
  expect(unknownIcon.status).toBe(400);
  const unknownIconProblem = error.parse(await unknownIcon.json()).error;
  expect(
    unknownIconProblem.fieldErrors?.find((entry) => entry.field === 'icon')?.message,
  ).toContain('not registered');
});

it('distinguishes an unconfigured navigation directory from malformed page input', async () => {
  fixture = await createHttpFixture();
  const groupResponse = await api(fixture)('POST', '/v1/navigation', {
    body: { type: 'group', name: 'Workspace', visibility: 'container' },
  });
  expect(groupResponse.status).toBe(201);
  const group = entity.parse(await groupResponse.json());
  const page = {
    type: 'page',
    name: 'Dashboard',
    parentId: group.id,
    path: '/dashboard',
    visibility: 'authenticated',
  };
  const unavailable = await api(fixture)('POST', '/v1/navigation', { body: page });
  expect(unavailable.status).toBe(503);
  const unavailableProblem = error.parse(await unavailable.json()).error;
  expect(unavailableProblem.code).toBe('temporarily_unavailable');
  expect(
    unavailableProblem.fieldErrors?.find((entry) => entry.field === 'path')?.message,
  ).toContain('No navigation pages');
  const malformed = await api(fixture)('POST', '/v1/navigation', { body: { ...page, path: null } });
  expect(malformed.status).toBe(400);
  expect(await (await api(fixture)('GET', '/v1/me/navigation')).json()).toEqual({ rows: [] });
  expect((await fixture.store.database.query('SELECT id FROM navigation_nodes')).rowCount).toBe(1);
});

it.each([
  '',
  '?version=0',
  '?version=-1',
  '?version=1.5',
  '?version=invalid',
  '?version=1&version=2',
])('explains the query-only version contract for DELETE %s', async (query) => {
  fixture = await createHttpFixture();
  const created = await api(fixture)('POST', '/v1/roles', {
    body: { code: 'delete_contract', name: 'Delete contract' },
  });
  const role = entity.parse(await created.json());
  const rejected = await api(fixture)('DELETE', `/v1/roles/${role.id}${query}`, {
    body: { version: 1 },
  });
  expect(rejected.status).toBe(400);
  const rejectedProblem = error.parse(await rejected.json()).error;
  expect(
    rejectedProblem.fieldErrors?.find((entry) => entry.field === 'version')?.message,
  ).toContain('?version=');
  expect((await api(fixture)('GET', `/v1/roles/${role.id}`)).status).toBe(200);
  expect((await api(fixture)('DELETE', `/v1/roles/${role.id}?version=1`)).status).toBe(204);
});

it('documents the required DELETE version as a query parameter and has no JSON request body', async () => {
  fixture = await createHttpFixture();
  const response = await api(fixture)('GET', '/openapi.json');
  const document = z
    .object({
      paths: z.record(
        z.string(),
        z.object({
          delete: z
            .object({
              parameters: z.array(
                z.object({
                  name: z.string(),
                  in: z.string(),
                  required: z.boolean(),
                  description: z.string().optional(),
                }),
              ),
              requestBody: z.unknown().optional(),
            })
            .optional(),
        }),
      ),
    })
    .parse(await response.json());
  for (const path of [
    '/v1/roles/{id}',
    '/v1/permissions/{id}',
    '/v1/navigation/{id}',
    '/v1/endpoint-bindings/{id}',
  ]) {
    const operation = document.paths[path]?.delete;
    const parameter = operation?.parameters.find((entry) => entry.name === 'version');
    expect(parameter).toMatchObject({ in: 'query', required: true });
    expect(parameter?.description).toContain('?version=');
    expect(operation?.requestBody).toBeUndefined();
  }
});

it('explains archived account references while preserving terminal status and existing role reassignment', async () => {
  fixture = await createHttpFixture();
  const createdRole = await api(fixture)('POST', '/v1/roles', {
    body: { code: 'archive_reference', name: 'Archive reference' },
  });
  const role = entity.parse(await createdRole.json());
  const createdAccount = await api(fixture)('POST', '/v1/admins', {
    body: { email: 'archived-contract@example.test', roleId: role.id },
  });
  const account = z.object({ admin: entity }).parse(await createdAccount.json()).admin;
  expect(
    (
      await api(fixture)('PATCH', `/v1/admins/${account.id}`, {
        body: { version: 1, status: 'disabled' },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await api(fixture)('PATCH', `/v1/admins/${account.id}`, {
        body: { version: 2, status: 'archived' },
      })
    ).status,
  ).toBe(200);
  const referenced = await api(fixture)('DELETE', `/v1/roles/${role.id}?version=1`);
  expect(referenced.status).toBe(409);
  const referenceProblem = error.parse(await referenced.json()).error;
  expect(referenceProblem.code).toBe('resource_in_use');
  expect(referenceProblem.fieldErrors?.find((entry) => entry.field === 'id')?.message).toContain(
    'archived',
  );
  const restored = await api(fixture)('PATCH', `/v1/admins/${account.id}`, {
    body: { version: 3, status: 'active' },
  });
  expect(restored.status).toBe(400);
  const restoredProblem = error.parse(await restored.json()).error;
  expect(restoredProblem.fieldErrors?.find((entry) => entry.field === 'status')?.message).toContain(
    'cannot be restored',
  );
  expect(
    (
      await api(fixture)('PATCH', `/v1/roles/${role.id}`, {
        body: { version: 1, status: 'disabled' },
      })
    ).status,
  ).toBe(200);
  const detail = await api(fixture)('GET', `/v1/admins/${account.id}`);
  expect(await detail.json()).toMatchObject({ status: 'archived', roleId: role.id, version: 3 });
  const listing = await api(fixture)('GET', '/v1/roles?q=archive_reference');
  expect(await listing.json()).toMatchObject({
    rows: [{ id: role.id, status: 'disabled', adminCount: 1 }],
  });
  expect((await api(fixture)('DELETE', `/v1/roles/${role.id}?version=2`)).status).toBe(409);
  const replacementResponse = await api(fixture)('POST', '/v1/roles', {
    body: { code: 'retained_reference', name: 'Retained reference' },
  });
  const replacement = entity.parse(await replacementResponse.json());
  const moved = await api(fixture)('PATCH', `/v1/admins/${account.id}`, {
    body: { version: 3, roleId: replacement.id },
  });
  expect(moved.status).toBe(200);
  expect(await moved.json()).toMatchObject({
    status: 'archived',
    roleId: replacement.id,
    version: 4,
  });
  expect((await api(fixture)('DELETE', `/v1/roles/${role.id}?version=2`)).status).toBe(204);
});
