import { assertRawQueryBudget } from './query-budget.ts';
import { assertSelect } from '../fields/structure.ts';
import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition, ContentLimits, Where, JsonValue } from '../definition.ts';
import type { QueryInput } from '../model.ts';

const jsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);
const whereSchema: z.ZodType<Where> = z.lazy(() =>
  z.union([
    z.strictObject({ and: z.array(whereSchema).min(1) }),
    z.strictObject({ or: z.array(whereSchema).min(1) }),
    z.strictObject({
      field: z.string().min(1).max(512),
      operator: z.enum(['eq', 'ne', 'in', 'notIn', 'exists', 'gt', 'gte', 'lt', 'lte', 'contains']),
      value: jsonSchema,
    }),
  ]),
);
const querySchema = z.strictObject({
  where: whereSchema.optional(),
  policy: whereSchema.optional(),
  q: z.string().max(512).optional(),
  sort: z.array(z.strictObject({ field: z.string(), order: z.enum(['asc', 'desc']) })).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  locale: z.string().optional(),
  fallback: z.array(z.string()).optional(),
  mode: z.enum(['editing', 'published']).optional(),
  trashed: z.boolean().optional(),
  folderId: z.uuid().nullable().optional(),
  select: z.array(z.string().min(1)).optional(),
  depth: z.number().int().nonnegative().optional(),
});
export function assertWhereBudget(where: Where, limits: ContentLimits): void {
  const queue: { where: Where; depth: number }[] = [{ where, depth: 1 }];
  let count = 0;
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;
    count += 1;
    if (count > limits.maxQueryNodes || node.depth > limits.maxQueryDepth) fail('invalid_input');
    if ('and' in node.where)
      queue.push(...node.where.and.map((item) => ({ where: item, depth: node.depth + 1 })));
    if ('or' in node.where)
      queue.push(...node.where.or.map((item) => ({ where: item, depth: node.depth + 1 })));
  }
}
export function parseQuery(input: {
  collection: CollectionDefinition;
  input: unknown;
  limits: ContentLimits;
}): QueryInput {
  assertRawQueryBudget(input.input, input.limits);
  const result = querySchema.safeParse(input.input);
  if (!result.success) fail('invalid_input');
  const query = result.data;
  const locale = query.locale ?? input.collection.locales.default;
  const fallback =
    query.fallback ??
    (Object.hasOwn(input.collection.locales.fallback, locale)
      ? (input.collection.locales.fallback[locale] ?? [])
      : []);
  validateLocales(input.collection, locale, fallback);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? input.limits.defaultPageSize;
  validatePage({ page, pageSize, depth: query.depth ?? 0 }, input.limits);
  assertSelect(input.collection, query.select);
  const { where, policy } = query;

  if (where) assertWhereBudget(where, input.limits);
  if (policy) assertWhereBudget(policy, input.limits);
  return {
    locale,
    fallback,
    mode: query.mode ?? 'editing',
    page,
    pageSize,
    ...(where ? { where } : {}),
    ...(policy ? { policy } : {}),
    ...optionalQuery(query),
  };
}
function optionalQuery(query: z.infer<typeof querySchema>) {
  return {
    ...(query.q === undefined ? {} : { q: query.q }),
    ...(query.sort ? { sort: query.sort } : {}),
    ...(query.select ? { select: query.select } : {}),
    ...(query.trashed === undefined ? {} : { trashed: query.trashed }),
    ...(query.folderId === undefined ? {} : { folderId: query.folderId }),
    ...(query.depth === undefined ? {} : { depth: query.depth }),
  };
}

function validateLocales(
  collection: CollectionDefinition,
  locale: string,
  fallback: readonly string[],
): void {
  if (
    !collection.locales.supported.includes(locale) ||
    fallback.some((value) => !collection.locales.supported.includes(value)) ||
    new Set(fallback).size !== fallback.length ||
    fallback.includes(locale)
  )
    fail('invalid_input');
}

function validatePage(
  query: { page: number; pageSize: number; depth: number },
  limits: ContentLimits,
): void {
  if (
    query.pageSize > limits.maxPageSize ||
    !Number.isSafeInteger((query.page - 1) * query.pageSize) ||
    query.depth > limits.maxExpandDepth
  )
    fail('invalid_input');
}
