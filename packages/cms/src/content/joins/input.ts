import type { JoinQueryOptions, JoinQueries } from './definition.ts';
import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import { assertRawQueryBudget } from '../queries/query-budget.ts';
import { whereSchema } from '../queries/where-schema.ts';
import { fieldPaths } from '../fields/structure.ts';
import type { CollectionDefinition, ContentLimits } from '../definition.ts';

type Limits = Pick<ContentLimits, 'maxFields' | 'maxQueryNodes' | 'maxPageSize'>;
export function joinQuerySchema(limits: Limits) {
  return z.strictObject({
    page: z.number().int().positive().max(2_147_483_647).optional(),
    pageSize: z.number().int().positive().max(limits.maxPageSize).optional(),
    sort: z
      .array(z.strictObject({ field: z.string().min(1).max(256), order: z.enum(['asc', 'desc']) }))
      .max(limits.maxQueryNodes)
      .optional(),
    where: z.unknown().optional(),
    count: z.boolean().optional(),
  });
}

export function joinsInputSchema(limits: Limits) {
  return z.union([
    z.literal(false),
    z
      .record(z.string().min(1).max(512), z.union([z.literal(false), joinQuerySchema(limits)]))
      .refine((value) => Object.keys(value).length <= limits.maxQueryNodes),
  ]);
}

export function normalizedJoinQuery(raw: unknown, limits: ContentLimits): JoinQueryOptions {
  assertRawQueryBudget(raw, limits);
  const parsed = joinQuerySchema(limits).safeParse(raw);
  if (!parsed.success) fail('invalid_input');
  const { where, ...values } = parsed.data;
  const result: JoinQueryOptions = {
    ...(values.page === undefined ? {} : { page: values.page }),
    ...(values.pageSize === undefined ? {} : { pageSize: values.pageSize }),
    ...(values.sort === undefined ? {} : { sort: values.sort }),
    ...(values.count === undefined ? {} : { count: values.count }),
  };
  if (where === undefined) return result;
  const condition = whereSchema.safeParse(where);
  if (!condition.success) fail('invalid_input');
  return { ...result, where: condition.data };
}

export function normalizedJoinQueries(
  collection: CollectionDefinition,
  raw: unknown,
  limits: ContentLimits,
): JoinQueries | undefined {
  if (raw === undefined) return undefined;
  const parsed = joinsInputSchema(limits).safeParse(raw);
  if (!parsed.success) fail('invalid_input');
  if (parsed.data === false) return false;
  const paths = new Set(
    fieldPaths(collection.fields)
      .filter(({ field }) => field.type === 'join')
      .map(({ path }) => path),
  );
  const result: Record<string, false | JoinQueryOptions> = {};
  for (const [path, query] of Object.entries(parsed.data)) {
    if (!paths.has(path)) fail('invalid_input');
    result[path] = query === false ? false : normalizedJoinQuery(query, limits);
  }
  return result;
}

export function joinInputSchemas(limits: Limits & { maxBatchItems: number; maxLocales: number }) {
  const uuid = z.uuid().transform((value) => value.toLowerCase());
  const target = {
    collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    id: uuid,
    fieldId: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
    locale: z.string().min(1).max(32).optional(),
  };
  return {
    'documents.join': z.strictObject({
      ...target,
      ...joinQuerySchema(limits).shape,
      depth: z.number().int().nonnegative().optional(),
      mode: z.enum(['editing', 'published']).default('editing'),
      fallback: z.array(z.string()).max(limits.maxLocales).optional(),
    }),
    'documents.reorderJoin': z
      .strictObject({
        ...target,
        version: uuid,
        ids: z.array(uuid).min(1).max(limits.maxBatchItems),
        targetId: uuid,
        position: z.enum(['before', 'after']),
      })
      .refine(
        (value) =>
          new Set(value.ids).size === value.ids.length && !value.ids.includes(value.targetId),
      ),
  };
}
