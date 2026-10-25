import type { AccessApi } from '@new-cms/cms/access';
import type { IdentityApi } from '@new-cms/cms/identity';
import type { RequestContext } from '@new-cms/cms/platform/contracts';

export type BusinessHandler = (context: RequestContext, input: unknown) => Promise<unknown>;

export function businessHandlers(
  identity: IdentityApi,
  access: AccessApi,
): Map<string, BusinessHandler> {
  return new Map<string, BusinessHandler>([
    ['identity.login', identity.login.bind(identity)],
    ['identity.logout', identity.logout.bind(identity)],
    ['identity.changePassword', identity.changePassword.bind(identity)],
    ['identity.acceptInvitation', identity.acceptInvitation.bind(identity)],
    ['identity.requestPasswordReset', identity.requestPasswordReset.bind(identity)],
    ['identity.resetPassword', identity.resetPassword.bind(identity)],
    ['admins.list', access.listAdmins],
    ['admins.get', access.getAdmin],
    ['admins.create', access.createAdmin],
    ['admins.update', access.updateAdmin],
    ['admins.invite', access.inviteAdmin],
    ['roles.list', access.listRoles],
    ['roles.get', access.getRole],
    ['roles.create', access.createRole],
    ['roles.update', access.updateRole],
    ['roles.replacePermissions', access.replaceRolePermissions],
    ['roles.delete', access.deleteRole],
    ['permissions.list', access.listPermissions],
    ['permissions.create', access.createPermission],
    ['permissions.update', access.updatePermission],
    ['permissions.delete', access.deletePermission],
    ['navigation.list', access.listNavigation],
    ['navigation.create', access.createNavigation],
    ['navigation.update', access.updateNavigation],
    ['navigation.delete', access.deleteNavigation],
    ['endpoints.list', access.listEndpoints],
    ['endpoints.createBinding', access.createBinding],
    ['endpoints.updateBinding', access.updateBinding],
    ['endpoints.deleteBinding', access.deleteBinding],
    ['access.me', access.me],
    ['access.updateOwnProfile', access.updateOwnProfile],
    ['access.myNavigation', access.myNavigation],
    ['access.myOperations', access.myOperations],
    ['audit.list', access.listAuditLogs.bind(access)],
  ]);
}
