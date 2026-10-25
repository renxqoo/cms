import type { z } from 'zod';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import type { Page } from '../../contracts/access';
import type { OperationId } from '../../contracts/operations';
import { managementReadPolicy } from './policy';
import { readBudget } from './read-budget';

export type ApiFailure = Extract<ApiResult<unknown>, { ok: false }>;

export interface AllPagesRequest<T> {
  operation: OperationId;
  params?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, unknown>>;
  response: z.ZodType<Page<T>>;
  signal: AbortSignal;
  key: (row: T) => string;
}

function consistentPage<T>(page: Page<T>, expected: { page: number; total: number | null }) {
  const { pageSize, maxPages, maxItems } = managementReadPolicy;
  const offset = (expected.page - 1) * pageSize;
  return (
    page.page === expected.page &&
    page.pageSize === pageSize &&
    page.total <= maxItems &&
    Math.ceil(page.total / pageSize) <= maxPages &&
    (expected.total === null || page.total === expected.total) &&
    page.rows.length === Math.min(pageSize, Math.max(0, page.total - offset))
  );
}

async function readRound<T>(input: AllPagesRequest<T>): Promise<ApiResult<T[]>> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  let page = 1;
  while (!input.signal.aborted) {
    const result = await requestApi({
      ...input,
      query: { ...input.query, page, pageSize: managementReadPolicy.pageSize },
    });
    if (input.signal.aborted) return failure('request_cancelled', 0);
    if (!result.ok) return result;
    if (result.data.total > managementReadPolicy.maxItems)
      return failure('read_limit_exceeded', 413);
    if (!consistentPage(result.data, { page, total }))
      return failure('inconsistent_pagination', 502);
    ({ total } = result.data);
    for (const row of result.data.rows) {
      const key = input.key(row);
      if (!key || seen.has(key)) return failure('inconsistent_pagination', 502);
      seen.add(key);
      rows.push(row);
    }
    if (rows.length === total) return { ...result, data: rows };
    page += 1;
  }
  return failure('request_cancelled', 0);
}

export async function readAllPages<T>(input: AllPagesRequest<T>): Promise<ApiResult<T[]>> {
  if (input.query && ('page' in input.query || 'pageSize' in input.query))
    return failure('invalid_input', 400);
  const budget = readBudget(input.signal);
  try {
    let result: ApiResult<T[]> = failure('inconsistent_pagination', 502);
    for (let attempt = 0; attempt < managementReadPolicy.attempts; attempt += 1) {
      result = await readRound({ ...input, signal: budget.signal });
      if (result.ok || result.error.code !== 'inconsistent_pagination') break;
    }
    return budget.timedOut() ? failure('read_timeout', 0) : result;
  } catch {
    if (budget.timedOut()) return failure('read_timeout', 0);
    return failure(budget.signal.aborted ? 'request_cancelled' : 'invalid_response', 0);
  } finally {
    budget.close();
  }
}
