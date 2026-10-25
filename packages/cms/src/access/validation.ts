import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';

export const id = z.uuid().toLowerCase();
export const version = z.number().int().positive().max(2147483647);
export const status = z.enum(['active', 'disabled']);
export const name = z.string().trim().min(1).max(128);
export const description = z.string().max(512).nullable();
export const code = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const permissionCode = z
  .string()
  .max(160)
  .regex(/^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*){1,3}$/);
export const scopeShape = {
  scopeKind: z.enum(['global', 'collection']),
  collectionKey: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/)
    .nullable()
    .default(null),
};
export const targetSchema = z.strictObject({ id });
export const deleteSchema = z.strictObject({ id, version });
export const emptySchema = z.strictObject({});

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    if (
      result.error.issues.some(
        (issue) => issue.code === 'too_big' && issue.path.at(-1) === 'permissionIds',
      )
    )
      fail('capacity_exceeded');
    if (
      result.error.issues.some(
        (issue) => issue.path[0] === 'scopeKind' || issue.path[0] === 'collectionKey',
      )
    )
      fail('invalid_scope');
    fail('invalid_input', {
      fieldErrors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export function listShape(policy: CmsPolicy) {
  return {
    page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
    pageSize: z.number().int().min(1).max(policy.maxPageSize).default(policy.defaultPageSize),
    q: z.string().max(128).default(''),
    order: z.enum(['asc', 'desc']).default('desc'),
  };
}

export function requirePatch(input: object) {
  if (Object.keys(input).every((key) => key === 'id' || key === 'version')) fail('invalid_input');
}

export function requireVersion(current: { version: number }, expected: number) {
  if (current.version !== expected) fail('version_conflict');
}

export function requireScope(
  scope: { scopeKind: string; collectionKey: string | null },
  keys: readonly string[],
) {
  if (scope.scopeKind === 'global' && scope.collectionKey !== null) fail('invalid_scope');
  if (
    scope.scopeKind === 'collection' &&
    (scope.collectionKey === null || !keys.includes(scope.collectionKey))
  )
    fail('invalid_scope');
}

export function escapedSearch(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}
