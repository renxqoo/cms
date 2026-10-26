import type { ApiResult } from '../../api/client';
import { failure } from '../../api/result';
import { endpointListSchema } from '../../contracts/access';
import type { Endpoint } from '../../contracts/access';
import { readAllPages } from '../management-shared/read-all-pages';
import { endpointKey } from './endpoint-model';

export type BindingTarget = Pick<
  Endpoint,
  'operationId' | 'scopeKind' | 'collectionKey' | 'binding'
>;
export interface EndpointReadSource {
  operation: 'endpoints.list' | 'access.readRecovery';
  read: (signal: AbortSignal) => Promise<ApiResult<Endpoint[]>>;
}
export interface BindingReadSource {
  operation: 'endpoints.list' | 'access.readRecovery';
  read: (target: BindingTarget, signal: AbortSignal) => Promise<ApiResult<BindingTarget | null>>;
}
export const endpointReadSource: EndpointReadSource = {
  operation: 'endpoints.list',
  read: (signal) =>
    readAllPages({
      operation: 'endpoints.list',
      response: endpointListSchema,
      signal,
      key: endpointKey,
    }),
};
export const bindingReadSource: BindingReadSource = {
  operation: 'endpoints.list',
  async read(target, signal) {
    const result = await endpointReadSource.read(signal);
    if (!result.ok) return result;
    const current = result.data.find((row) => endpointKey(row) === endpointKey(target));
    if (!current) return failure('not_found', 404);
    return { ...result, data: current.binding ? current : null };
  },
};
