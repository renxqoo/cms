import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { allowedOperationsSchema, myNavigationSchema } from '../../contracts/auth';
import type { AllowedOperation, VisibleNavigation } from '../../contracts/auth';
import { readAllPages } from '../management-shared/read-all-pages';
import { readBudget } from '../management-shared/read-budget';
import { operationKey } from './operation-key';

export interface AccessData {
  operations: readonly AllowedOperation[];
  navigation: readonly VisibleNavigation[];
}

export async function loadAccess(signal: AbortSignal): Promise<ApiResult<AccessData>> {
  if (signal.aborted) return failure('request_cancelled', 0);
  const budget = readBudget(signal);
  try {
    const [operations, navigation] = await Promise.all([
      readAllPages({
        operation: 'access.myOperations',
        response: allowedOperationsSchema,
        signal: budget.signal,
        key: operationKey,
      }),
      requestApi({
        operation: 'access.myNavigation',
        response: myNavigationSchema,
        signal: budget.signal,
      }),
    ]);
    if (budget.timedOut()) return failure('read_timeout', 0);
    if (budget.signal.aborted) return failure('request_cancelled', 0);
    if (!operations.ok) return operations;
    if (!navigation.ok) return navigation;
    return {
      ok: true,
      status: 200,
      requestId: operations.requestId,
      data: { operations: operations.data, navigation: navigation.data.rows },
    };
  } finally {
    budget.close();
  }
}
