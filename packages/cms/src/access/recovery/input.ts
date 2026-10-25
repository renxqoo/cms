import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { id, status } from '../validation.ts';

function recoveryFilters(policy: CmsPolicy) {
  return {
    page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
    pageSize: z.number().int().positive().max(policy.maxPageSize).default(policy.defaultPageSize),
    scopeKind: z.enum(['global', 'collection']).optional(),
    collectionKey: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/)
      .optional(),
  };
}

export function recoveryInputSchema(policy: CmsPolicy) {
  const shared = recoveryFilters(policy);
  const operationId = z.string().min(1).max(128).optional();
  return z
    .discriminatedUnion('resource', [
      z.strictObject({
        resource: z.literal('endpoints'),
        ...shared,
        operationId,
        module: z.string().min(1).max(32).optional(),
      }),
      z.strictObject({
        resource: z.literal('bindings'),
        ...shared,
        id: id.optional(),
        operationId,
        permissionId: id.optional(),
      }),
      z.strictObject({
        resource: z.literal('permissions'),
        ...shared,
        id: id.optional(),
        code: z.string().min(1).max(160).optional(),
        status: status.optional(),
      }),
    ])
    .superRefine((query, ctx) => {
      if (query.collectionKey !== undefined && query.scopeKind !== 'collection') {
        ctx.addIssue({
          code: 'custom',
          path: ['collectionKey'],
          message: 'Collection requires collection scope',
        });
      }
      if (!Number.isSafeInteger((query.page - 1) * query.pageSize)) {
        ctx.addIssue({
          code: 'custom',
          path: ['page'],
          message: 'Page offset exceeds safe integer range',
        });
      }
    });
}

export type RecoveryInput = z.infer<ReturnType<typeof recoveryInputSchema>>;

export function parseRecoveryInput(
  schema: ReturnType<typeof recoveryInputSchema>,
  input: unknown,
): RecoveryInput {
  const result = schema.safeParse(input);
  if (!result.success) {
    fail('invalid_input', {
      fieldErrors: result.error.issues.flatMap((issue) => {
        if (issue.code === 'unrecognized_keys') {
          return issue.keys.map((field) => ({ field, message: 'Unknown parameter' }));
        }
        return [{ field: issue.path.join('.'), message: issue.message }];
      }),
    });
  }
  return result.data;
}
