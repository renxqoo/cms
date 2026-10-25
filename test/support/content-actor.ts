import { vi, expect } from 'vitest';
import { contentContext, contentPassword } from './content-runtime.ts';
import type { ContentFixture } from './content-runtime.ts';

export async function contentActor(kit: ContentFixture, permissions: readonly string[]) {
  const permissionIds = permissions.map((key) => {
    const id = kit.permissionIds.get(key);
    if (!id) throw new Error('Permission missing');
    return id;
  });
  const role = await kit.access.api.createRole(kit.owner(), {
    code: 'content_editor',
    name: 'Content editor',
    permissionIds,
  });
  await kit.access.api.createAdmin(kit.owner(), { email: 'editor@example.test', roleId: role.id });
  await vi.waitFor(() => {
    expect(kit.messages.some((message) => message.to === 'editor@example.test')).toBe(true);
  });
  const message = kit.messages.find((item) => item.to === 'editor@example.test');
  if (!message) throw new Error('Invitation missing');
  await kit.identity.api.acceptInvitation(contentContext(), {
    token: message.token,
    newPassword: contentPassword,
  });
  const login = await kit.identity.api.login(contentContext(), {
    email: 'editor@example.test',
    password: contentPassword,
  });
  return { role, ctx: () => contentContext(login.token) };
}
