import { expect, test } from 'vitest';
import { createAccess } from '../composition.ts';
import { context, createFixture } from './support.ts';

test('hides pages removed from the registered frontend directory without deleting management records', async () => {
  const fixture = await createFixture();
  const group = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'group',
    name: 'Workspace',
    visibility: 'container',
  });
  const page = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'page',
    name: 'Dashboard',
    parentId: group.id,
    path: '/dashboard',
    visibility: 'authenticated',
  });
  const action = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'action',
    name: 'Preview',
    parentId: page.id,
    visibility: 'authenticated',
  });
  const withoutTargets = createAccess({ ...fixture.accessOptions, navigationPaths: [] });
  expect(await withoutTargets.api.myNavigation(fixture.owner, {})).toEqual({ rows: [] });
  expect(await withoutTargets.api.listNavigation(fixture.owner, {})).toMatchObject({
    rows: [{ id: group.id, children: [{ id: page.id, children: [{ id: action.id }] }] }],
  });
  expect(await fixture.access.api.myNavigation(fixture.owner, {})).toMatchObject({
    rows: [{ id: group.id, children: [{ id: page.id }] }],
  });
});
