import { z } from 'zod';
import type { SqlExecutor } from '@new-cms/database/client';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { AccountPage } from './types.ts';
import { queryAccounts } from './adapters/postgres/accounts.ts';
import { parseInput } from './validation.ts';

function listSchema(policy: CmsPolicy) {
  return z.strictObject({
    page: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .positive()
      .max(policy.maxPageSize)
      .default(policy.defaultPageSize),
    q: z.string().max(128).default(''),
    order: z.enum(['asc', 'desc']).default('desc'),
    sortBy: z.enum(['createdAt', 'email', 'displayName', 'lastLoginAt']).default('createdAt'),
    status: z.enum(['active', 'disabled', 'archived']).optional(),
    activation: z.enum(['pending', 'activated']).optional(),
  });
}

function filters(input: z.infer<ReturnType<typeof listSchema>>) {
  const values: unknown[] = [];
  const parts = ['true'];
  if (input.q) {
    values.push(`%${input.q.replace(/[\\%_]/g, '\\$&')}%`);
    parts.push(`(a.email ILIKE $${values.length} OR a.display_name ILIKE $${values.length})`);
  }
  if (input.status) {
    values.push(input.status);
    parts.push(`a.status=$${values.length}`);
  }
  if (input.activation) {
    const operator = input.activation === 'activated' ? '' : 'NOT';
    parts.push(`${operator} EXISTS(SELECT 1 FROM credentials c WHERE c.admin_id=a.id)`);
  }
  return { where: parts.join(' AND '), values };
}

export async function listAccounts(
  tx: SqlExecutor,
  value: unknown,
  policy: CmsPolicy,
): Promise<AccountPage> {
  const input = parseInput(listSchema(policy), value);
  const columns = {
    createdAt: 'a.created_at',
    email: 'a.email',
    displayName: 'a.display_name',
    lastLoginAt: 'a.last_login_at',
  };
  const offset = (input.page - 1) * input.pageSize;
  if (!Number.isSafeInteger(offset)) fail('invalid_input');
  const result = await queryAccounts(tx, {
    ...filters(input),
    order: `${columns[input.sortBy]} ${input.order} NULLS LAST`,
    limit: input.pageSize,
    offset,
  });
  return { ...result, page: input.page, pageSize: input.pageSize };
}
