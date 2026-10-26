import { afterEach, expect, it, vi } from 'vitest';
import Roles from '../page';
import Role from '../[id]/page';
import Permissions from '../../permissions/page';
import Navigation from '../../navigation/page';
import Endpoints from '../../endpoints/page';
import Recovery from '../../access-recovery/page';
import { RecoveryPage } from '../../../../../features/endpoints/recovery-page';
import Audit from '../../audit-logs/page';
import { RolesPage } from '../../../../../features/roles/roles-page';
import { RoleDetailPage } from '../../../../../features/roles/role-detail';
import { PermissionsPage } from '../../../../../features/permissions/permissions-page';
import { NavigationPage } from '../../../../../features/navigation/navigation-page';
import { EndpointsPage } from '../../../../../features/endpoints/endpoints-page';
import { AuditPage } from '../../../../../features/audit/audit-page';

const session = vi.hoisted(() => ({ require: vi.fn<() => Promise<unknown>>() }));
vi.mock('../../../../../server/require-session', () => ({ requireSession: session.require }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('Not found');
  },
}));
afterEach(() => vi.resetAllMocks());

it.each([
  { name: 'roles', route: Roles, feature: RolesPage },
  { name: 'permissions', route: Permissions, feature: PermissionsPage },
  { name: 'navigation', route: Navigation, feature: NavigationPage },
  { name: 'endpoints', route: Endpoints, feature: EndpointsPage },
  { name: 'audit', route: Audit, feature: AuditPage },
  { name: 'recovery', route: Recovery, feature: RecoveryPage },
])(
  'checks the server session before constructing the $name feature',
  async ({ route, feature }) => {
    session.require.mockRejectedValueOnce(new Error('Redirect to login'));
    await expect(route()).rejects.toThrow('Redirect to login');
    session.require.mockResolvedValueOnce({ id: 'verified' });
    expect((await route()).type).toBe(feature);
    expect(session.require).toHaveBeenCalledTimes(2);
  },
);

it('rejects invalid detail IDs after session verification and passes only a validated UUID', async () => {
  session.require.mockResolvedValue({ id: 'verified' });
  await expect(Role({ params: Promise.resolve({ id: 'not-an-id' }) })).rejects.toThrow('Not found');
  const id = '11111111-1111-4111-8111-111111111111';
  const output = await Role({ params: Promise.resolve({ id }) });
  expect(output.type).toBe(RoleDetailPage);
  expect(output.props).toEqual({ id });
  session.require.mockRejectedValueOnce(new Error('Redirect to login'));
  await expect(Role({ params: Promise.resolve({ id }) })).rejects.toThrow('Redirect to login');
});
