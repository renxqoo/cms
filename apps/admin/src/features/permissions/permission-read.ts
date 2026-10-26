import { failure } from '../../api/result';
import { permissionListSchema } from '../../contracts/access';
import type { Permission } from '../../contracts/access';
import type { ApiResult } from '../../api/client';
import { readAllPages } from '../management-shared/read-all-pages';

export async function findPermission(input: {
  id: string;
  signal: AbortSignal;
}): Promise<ApiResult<Permission>> {
  const result = await readAllPages({
    operation: 'permissions.list',
    response: permissionListSchema,
    signal: input.signal,
    key: (permission) => permission.id,
  });
  if (!result.ok) return result;
  const permission = result.data.find((item) => item.id === input.id);
  return permission ? { ...result, data: permission } : failure('not_found', 404);
}

export interface PermissionReadSource {
  operation: 'permissions.list' | 'access.readRecovery';
  find: typeof findPermission;
  ready?: boolean;
}
export const permissionReadSource: PermissionReadSource = {
  operation: 'permissions.list',
  find: findPermission,
};
