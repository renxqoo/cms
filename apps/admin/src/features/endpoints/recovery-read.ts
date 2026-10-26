import { failure } from '../../api/result';
import {
  recoveryEndpointListSchema,
  recoveryBindingListSchema,
  recoveryPermissionListSchema,
} from '../../contracts/access';
import type { Binding, Endpoint, Permission } from '../../contracts/access';
import { readAllPages } from '../management-shared/read-all-pages';
import type { PermissionReadSource } from '../permissions/permission-read';
import type { BindingReadSource, EndpointReadSource } from './binding-read';
import { endpointKey } from './endpoint-model';

export function recoveryPermissionKey(permission: Permission) {
  return permission.id;
}
export function recoveryBindingKey(binding: Binding) {
  return binding.id;
}

export const recoveryEndpointSource: EndpointReadSource = {
  operation: 'access.readRecovery',
  read: (signal) =>
    readAllPages({
      operation: 'access.readRecovery',
      query: { resource: 'endpoints' },
      response: recoveryEndpointListSchema,
      signal,
      key: endpointKey,
    }),
};
export const recoveryPermissionSource: PermissionReadSource = {
  operation: 'access.readRecovery',
  async find({ id, signal }) {
    const result = await readAllPages({
      operation: 'access.readRecovery',
      query: { resource: 'permissions' },
      response: recoveryPermissionListSchema,
      signal,
      key: recoveryPermissionKey,
    });
    if (!result.ok) return result;
    const permission = result.data.find((row) => row.id === id);
    return permission ? { ...result, data: permission } : failure('not_found', 404);
  },
};
export const recoveryBindingSource: BindingReadSource = {
  operation: 'access.readRecovery',
  async read(target, signal) {
    const result = await readAllPages({
      operation: 'access.readRecovery',
      query: { resource: 'bindings' },
      response: recoveryBindingListSchema,
      signal,
      key: recoveryBindingKey,
    });
    if (!result.ok) return result;
    const binding = result.data.find((row) => row.id === target.binding?.id);
    return { ...result, data: binding ? bindingTarget(binding) : null };
  },
};
export function bindingTarget(
  binding: Binding,
): Pick<Endpoint, 'operationId' | 'scopeKind' | 'collectionKey' | 'binding'> {
  return {
    operationId: binding.operationId,
    scopeKind: binding.scopeKind,
    collectionKey: binding.collectionKey,
    binding: { id: binding.id, permissionId: binding.permissionId, version: binding.version },
  };
}
