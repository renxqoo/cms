import type { OperationDefinition } from '@new-cms/cms/platform/contracts';

function operation(
  id: string,
  path: string,
  access: OperationDefinition['access'],
): OperationDefinition {
  return {
    id: `identity.${id}`,
    module: 'identity',
    method: 'POST',
    path,
    access,
    scopeKind: 'global',
    bindingConfigurable: false,
    ...(id === 'requestPasswordReset' ? { successStatus: 202 as const } : {}),
  };
}

export const identityOperations: readonly OperationDefinition[] = [
  operation('login', '/v1/auth/login', 'public'),
  operation('logout', '/v1/auth/logout', 'authenticated'),
  operation('acceptInvitation', '/v1/auth/invitation-acceptances', 'public'),
  operation('requestPasswordReset', '/v1/auth/password-reset-requests', 'public'),
  operation('resetPassword', '/v1/auth/password-resets', 'public'),
  {
    id: 'identity.changePassword',
    module: 'identity',
    method: 'PUT',
    path: '/v1/me/password',
    access: 'authenticated',
    scopeKind: 'global',
    bindingConfigurable: false,
  },
];
