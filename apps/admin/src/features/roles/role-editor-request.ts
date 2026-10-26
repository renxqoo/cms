import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/client';
import { roleDetailSchema, roleSchema } from '../../contracts/access';
import type { RoleDetail } from '../../contracts/access';
import { metadataChanges } from './role-model';
import type { RoleValues } from './role-model';

export interface RoleWrite {
  kind: 'metadata' | 'grants';
  confirmed: RoleDetail;
  values: RoleValues;
  grants: string[];
  signal: AbortSignal;
}

export async function writeRole(input: RoleWrite): Promise<ApiResult<RoleDetail>> {
  const params = { id: input.confirmed.id };
  if (input.kind === 'grants')
    return requestApi({
      operation: 'roles.replacePermissions',
      params,
      body: { version: input.confirmed.version, permissionIds: input.grants },
      response: roleDetailSchema,
      signal: input.signal,
    });
  const result = await requestApi({
    operation: 'roles.update',
    params,
    body: { version: input.confirmed.version, ...metadataChanges(input.confirmed, input.values) },
    response: roleSchema,
    signal: input.signal,
  });
  return result.ok ? { ...result, data: { ...input.confirmed, ...result.data } } : result;
}
