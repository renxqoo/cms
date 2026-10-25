import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { z } from 'zod';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { accessInputSchemas } from '../index.ts';
import { context, createFixture, password, role } from './support.ts';

const profileInputs = [
  ['admins.create', { email: 'profile@example.test', roleId: randomUUID() }],
  ['admins.update', { id: randomUUID(), version: 1 }],
  ['access.updateOwnProfile', { version: 1 }],
] as const;

test.each(profileInputs)(
  '%s publishes the same nonempty display name contract it enforces',
  (operationId, base) => {
    const schema = accessInputSchemas(createTestPolicy())[operationId];
    for (const displayName of ['', 'N'.repeat(65)])
      expect(schema.safeParse({ ...base, displayName }).success).toBe(false);
    for (const displayName of ['N', 'N'.repeat(64), null])
      expect(schema.safeParse({ ...base, displayName }).success).toBe(true);
    const document = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
    expect(document.properties?.['displayName']).toHaveProperty(
      'anyOf',
      expect.arrayContaining([{ type: 'string', minLength: 1, maxLength: 64 }, { type: 'null' }]),
    );
  },
);

test('invalid display names never create accounts or change either profile and valid boundaries persist', async () => {
  const fixture = await createFixture();
  const memberRole = await role(fixture, { code: 'profile_member' });
  for (const displayName of ['', 'N'.repeat(65)]) {
    await expect(
      fixture.access.api.createAdmin(context(fixture.owner.token), {
        email: 'invalid-profile@example.test',
        roleId: memberRole.id,
        displayName,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      fixture.access.api.updateAdmin(fixture.owner, {
        id: fixture.admin.id,
        version: 1,
        displayName,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      fixture.access.api.updateOwnProfile(fixture.owner, { version: 1, displayName }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  }
  expect(await fixture.access.api.getAdmin(fixture.owner, { id: fixture.admin.id })).toMatchObject({
    version: 1,
    displayName: null,
  });
  expect(
    await fixture.access.api.listAdmins(fixture.owner, { q: 'invalid-profile' }),
  ).toMatchObject({
    total: 0,
    rows: [],
  });
  for (const [index, displayName] of ['N', 'N'.repeat(64), null].entries()) {
    const created = await fixture.access.api.createAdmin(context(fixture.owner.token), {
      email: `valid-profile-${index}@example.test`,
      roleId: memberRole.id,
      displayName,
    });
    expect(created.admin.displayName).toBe(displayName);
    const updated = await fixture.access.api.updateAdmin(fixture.owner, {
      id: created.admin.id,
      version: 1,
      displayName: displayName === null ? 'N' : null,
    });
    expect(updated).toMatchObject({
      version: 2,
      displayName: displayName === null ? 'N' : null,
    });
    const owner = await fixture.access.api.getAdmin(fixture.owner, { id: fixture.admin.id });
    expect(
      await fixture.access.api.updateOwnProfile(fixture.owner, {
        version: owner.version,
        displayName,
      }),
    ).toMatchObject({ displayName });
  }
});

test('initializer rejects an empty display name with the same input error before protected state checks', async () => {
  const fixture = await createFixture();
  await expect(
    fixture.access.initializeAdmin({ email: 'new-owner@example.test', password, displayName: '' }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});
