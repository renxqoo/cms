import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import type { Where, SortField } from '../definition.ts';

const integer = (maximum: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/u)
    .transform(Number)
    .pipe(z.number().int().positive().max(maximum));
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
const localeSchema = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      return Intl.getCanonicalLocales(value)[0] === value;
    } catch {
      return false;
    }
  });
export const publicLocaleSchema = localeSchema.optional();
const catalogSchema = z
  .object({
    locale: publicLocaleSchema,
    q: z.string().trim().max(120).optional(),
    category: z.enum(['text', 'image', 'video', 'embedding', 'audio']).optional(),
    task: z.string().min(1).max(80).optional(),
    developer: z.uuid().optional(),
    input: z.string().min(1).max(80).optional(),
    output: z.string().min(1).max(80).optional(),
    capability: z.string().min(1).max(80).optional(),
    featured: flag.optional(),
    callable: flag.optional(),
    ids: z
      .string()
      .transform((value) => value.split(','))
      .pipe(z.array(z.uuid()).min(1).max(100))
      .optional(),
    page: integer(1_000_000).default(1),
    pageSize: integer(100).default(20),
    sort: z.enum(['order', 'title', 'updated']).default('order'),
  })
  .strict();
export type CatalogQuery = z.output<typeof catalogSchema>;
export function parseCatalogQuery(input: unknown): CatalogQuery {
  const result = catalogSchema.safeParse(input);
  if (!result.success) fail('invalid_input');
  return result.data;
}
export function parsePublicLocale(input: unknown): string | undefined {
  const result = publicLocaleSchema.safeParse(input);
  if (!result.success) fail('invalid_input');
  return result.data;
}
export function selectedLocale(locale: string): Where {
  return { field: 'contentLocales', operator: 'contains', value: [locale] };
}
export function catalogWhere(input: CatalogQuery, locale: string): Where {
  const nodes: Where[] = [selectedLocale(locale)];
  const simple = [
    ['category', 'primaryCategory'],
    ['task', 'technicalCapabilities.tasks'],
    ['input', 'technicalCapabilities.inputs'],
    ['output', 'technicalCapabilities.outputs'],
    ['capability', 'technicalCapabilities.features'],
    ['featured', 'presentation.featured'],
  ] as const;
  for (const [key, field] of simple)
    if (input[key] !== undefined) nodes.push({ field, operator: 'eq', value: input[key] });
  if (input.developer)
    nodes.push({
      field: 'developer',
      operator: 'eq',
      value: { collection: 'developers', id: input.developer },
    });
  if (input.ids) nodes.push({ field: 'id', operator: 'in', value: input.ids });
  if (input.callable !== undefined)
    nodes.push({ field: 'apiBindings.key', operator: 'exists', value: input.callable });
  return { and: nodes };
}
export function catalogSort(sort: CatalogQuery['sort']): SortField[] {
  if (sort === 'title') return [{ field: 'title', order: 'asc' }];
  if (sort === 'updated') return [];
  return [{ field: 'presentation.sortOrder', order: 'asc' }];
}
