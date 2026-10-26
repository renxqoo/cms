'use client';

import { useEffect, useMemo, useState } from 'react';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { allowedOperationsSchema } from '../../contracts/auth';
import type { AllowedOperation } from '../../contracts/auth';
import { collectionListSchema } from '../../contracts/content';
import type { Collection } from '../../contracts/content';
import { authorizationRequestSchema } from '../../contracts/credentials';
import type { AuthorizationRequest } from '../../contracts/credentials';
import { readAllPages } from '../management-shared/read-all-pages';
import type { ApiFailure } from '../management-shared/read-all-pages';
import { grantKey } from './resource-permission-model';
import { returnToAuthorizationLogin } from './authorization-navigation';

export interface AuthorizationData {
  request: AuthorizationRequest;
  operations: AllowedOperation[];
  collections: Collection[];
}

async function readAuthorization(
  requestId: string,
  signal: AbortSignal,
): Promise<ApiResult<AuthorizationData>> {
  try {
    const [request, operations, collections] = await Promise.all([
      requestApi({
        operation: 'credentials.getAuthorization',
        params: { requestId },
        response: authorizationRequestSchema,
        signal,
      }),
      readAllPages({
        operation: 'access.myOperations',
        response: allowedOperationsSchema,
        signal,
        key: grantKey,
      }),
      requestApi({ operation: 'collections.list', response: collectionListSchema, signal }),
    ]);
    if (!request.ok) return request;
    if (!operations.ok) return operations;
    if (!collections.ok) return collections;
    return {
      ...request,
      data: {
        request: request.data,
        operations: operations.data,
        collections: collections.data.rows,
      },
    };
  } catch {
    return failure('invalid_response', 0);
  }
}

export function useAuthorizationRequest(requestId: string | null) {
  const [revision, setRevision] = useState(0);
  const source = useMemo(() => ({ requestId, revision }), [requestId, revision]);
  const [state, setState] = useState<{
    source: unknown;
    data: AuthorizationData | null;
    error: ApiFailure | null;
  }>({ source: null, data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    if (source.requestId)
      void readAuthorization(source.requestId, controller.signal).then((result) => {
        if (controller.signal.aborted) return result;
        setState({
          source,
          data: result.ok ? result.data : null,
          error: result.ok ? null : result,
        });
        if (!result.ok && result.status === 401 && source.requestId)
          returnToAuthorizationLogin(source.requestId);
        return result;
      });
    return () => controller.abort();
  }, [source]);
  const matches = source === state.source;
  const phase = matches ? completedPhase(state.error) : 'loading';
  return {
    phase,
    data: matches ? state.data : null,
    error: matches ? state.error : null,
    reload: () => setRevision((value) => value + 1),
  };
}

function completedPhase(error: ApiFailure | null) {
  return error ? 'failed' : 'ready';
}
