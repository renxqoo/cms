import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { OperationDefinition, Scope } from '@new-cms/cms/platform/contracts';
import { createFixture, invite, permission, role } from './support.ts';

const publish: OperationDefinition = {
  id: 'content.test.publish',
  module: 'content_test',
  method: 'POST',
  path: '/v1/collections/:collection/test-publication',
  access: 'permission',
  scopeKind: 'collection',
  bindingConfigurable: true,
};
const scope: Scope = { scopeKind: 'collection', collectionKey: 'articles' };

it('persistent work rechecks current grants without retaining a session token', async () => {
  const fixture = await createFixture({ operations: [publish] });
  const grant = await permission(fixture, {
    code: 'content:articles:publish',
    scopeKind: 'collection',
    collectionKey: 'articles',
  });
  await fixture.access.api.createBinding(fixture.owner, {
    operationId: publish.id,
    ...scope,
    permissionId: grant.id,
  });
  const editorRole = await role(fixture, { code: 'scheduled_editor', permissionIds: [grant.id] });
  const editor = await invite(fixture, {
    email: 'scheduled-editor@example.test',
    roleId: editorRole.id,
  });
  const authorize = () =>
    fixture.database.transaction((tx) =>
      fixture.access.authorizeActor(tx, {
        actor: { id: editor.admin.id, delegationId: null },
        operationId: publish.id,
        scope,
      }),
    );
  expect(await authorize()).toMatchObject({ id: editor.admin.id, roleCode: 'scheduled_editor' });
  await fixture.identity.api.logout(editor.ctx, {});
  expect(await authorize()).toMatchObject({ id: editor.admin.id });
  await fixture.access.api.replaceRolePermissions(fixture.owner, {
    id: editorRole.id,
    version: editorRole.version,
    permissionIds: [],
  });
  await expect(authorize()).rejects.toMatchObject({ code: 'forbidden' });
});

it('persistent work rejects disabled, pending, missing actors and unsuitable operations', async () => {
  const fixture = await createFixture({ operations: [publish] });
  const editorRole = await role(fixture, { code: 'job_editor' });
  const pending = await invite(fixture, {
    email: 'pending-job@example.test',
    roleId: editorRole.id,
    activate: false,
  });
  const editor = await invite(fixture, {
    email: 'disabled-job@example.test',
    roleId: editorRole.id,
  });
  await fixture.access.api.updateAdmin(fixture.owner, {
    id: editor.admin.id,
    version: editor.admin.version,
    status: 'disabled',
  });
  for (const actorId of [pending.admin.id, editor.admin.id, randomUUID()]) {
    await expect(
      fixture.database.transaction((tx) =>
        fixture.access.authorizeActor(tx, {
          actor: { id: actorId, delegationId: null },
          operationId: publish.id,
          scope,
        }),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  }
  for (const operationId of ['identity.login', 'access.me']) {
    await expect(
      fixture.database.transaction((tx) =>
        fixture.access.authorizeActor(tx, {
          actor: { id: fixture.admin.id, delegationId: null },
          operationId,
          scope: { scopeKind: 'global', collectionKey: null },
        }),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  }
});

it('persistent super administrator work still needs the exact live collection binding', async () => {
  const fixture = await createFixture({ operations: [publish] });
  const authorize = (target: Scope) =>
    fixture.database.transaction((tx) =>
      fixture.access.authorizeActor(tx, {
        actor: { id: fixture.admin.id, delegationId: null },
        operationId: publish.id,
        scope: target,
      }),
    );
  await expect(authorize(scope)).rejects.toMatchObject({ code: 'endpoint_unbound' });
  const grant = await permission(fixture, {
    code: 'content:articles:publish',
    scopeKind: 'collection',
    collectionKey: 'articles',
  });
  const binding = await fixture.access.api.createBinding(fixture.owner, {
    operationId: publish.id,
    ...scope,
    permissionId: grant.id,
  });
  expect(await authorize(scope)).toMatchObject({ id: fixture.admin.id });
  await expect(
    authorize({ scopeKind: 'collection', collectionKey: 'pages' }),
  ).rejects.toMatchObject({ code: 'endpoint_unbound' });
  await fixture.access.api.deleteBinding(fixture.owner, {
    id: binding.id,
    version: binding.version,
  });
  await expect(authorize(scope)).rejects.toMatchObject({ code: 'endpoint_unbound' });
});
