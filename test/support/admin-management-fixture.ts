import { z } from 'zod';
import type { createCmsProcess } from './cms-process.ts';

export const pendingManagementAccount = {
  email: 'application-pending@example.test',
  displayName: 'Pending management administrator',
  password: 'Pending activation password 2026',
};

export async function seedPendingManagementAccount(
  cms: Awaited<ReturnType<typeof createCmsProcess>>,
  roleId: string,
) {
  const response = await cms.request('POST', '/v1/admins', {
    ...cms.owner,
    body: {
      email: pendingManagementAccount.email,
      displayName: pendingManagementAccount.displayName,
      roleId,
    },
  });
  if (response.status !== 201)
    throw new Error(`Pending fixture creation returned HTTP ${response.status}.`);
  const created = z.object({ admin: z.object({ id: z.uuid() }) }).parse(await response.json());
  const message = await cms.smtp.waitForMessage();
  if (!message.includes(pendingManagementAccount.email))
    throw new Error('The pending fixture must receive its real invitation.');
  const aged = await cms.store.database.query(
    "UPDATE action_tokens SET created_at=clock_timestamp()-interval '2 minutes' WHERE admin_id=$1 AND purpose='invitation'",
    [created.admin.id],
  );
  if (aged.rowCount !== 1)
    throw new Error('The pending fixture must have one historical, unused invitation.');
}
