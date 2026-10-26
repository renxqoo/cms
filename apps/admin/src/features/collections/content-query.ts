import { z } from 'zod';
import type { Collection } from '../../contracts/content';
import { contentPolicy, collectionPath } from './content-policy';
import { rawWhereBudget } from './query-budget';

export const whereSchema = z
  .strictObject({
    field: z.string(),
    operator: z.enum(['eq', 'ne', 'in', 'notIn', 'exists', 'gt', 'gte', 'lt', 'lte', 'contains']),
    value: z.json(),
  })
  .or(
    z.strictObject({
      get and() {
        return z.array(whereSchema).min(1);
      },
    }),
  )
  .or(
    z.strictObject({
      get or() {
        return z.array(whereSchema).min(1);
      },
    }),
  );
export type ContentWhere = z.infer<typeof whereSchema>;
const sorts = z
  .array(z.strictObject({ field: z.string(), order: z.enum(['asc', 'desc']) }))
  .max(contentPolicy.maximumQueryNodes);
const metadata = ['id', 'revision', 'createdAt', 'updatedAt', 'trashedAt', 'folderId'];
export interface ContentQuery {
  page: number;
  pageSize: number;
  q: string;
  locale: string;
  mode: 'editing' | 'published';
  trashed: boolean;
  folderId: string | null | undefined;
  where: ContentWhere | undefined;
  sort: z.infer<typeof sorts>;
  columns: string[];
  invalid: boolean;
}
function json(text: string | null): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
function positive(value: string | null, maximum: number, fallback: number) {
  const number = Number(value);
  return value && /^\d+$/.test(value) && Number.isInteger(number) && number > 0 && number <= maximum
    ? number
    : fallback;
}
export function validWhere(where: ContentWhere, collection: Collection) {
  const allowed = new Set([
    ...metadata,
    ...collection.fields.filter((field) => field.queryable).map((field) => field.path),
  ]);
  const queue = [{ node: where, depth: 1 }];
  let count = 0;
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) return false;
    count += 1;
    if (count > contentPolicy.maximumQueryNodes || item.depth > contentPolicy.maximumQueryDepth)
      return false;
    if ('and' in item.node)
      queue.push(...item.node.and.map((node) => ({ node, depth: item.depth + 1 })));
    else if ('or' in item.node)
      queue.push(...item.node.or.map((node) => ({ node, depth: item.depth + 1 })));
    else if (
      !allowed.has(item.node.field) ||
      (['in', 'notIn'].includes(item.node.operator) &&
        (!Array.isArray(item.node.value) || item.node.value.length === 0)) ||
      (item.node.operator === 'exists' && typeof item.node.value !== 'boolean')
    )
      return false;
  }
  return true;
}
export function parseContentQuery(search: URLSearchParams, collection: Collection): ContentQuery {
  const allowedSort = new Set([
    ...metadata,
    ...collection.fields.filter((field) => field.queryable).map((field) => field.path),
  ]);
  const parsedSort = sorts.safeParse(search.has('sort') ? json(search.get('sort')) : []);
  const rawWhere = json(search.get('where'));
  const parsedWhere = whereSchema.optional().safeParse(rawWhereBudget(rawWhere) ? rawWhere : null);
  const rawColumns = z.array(z.string()).safeParse(json(search.get('columns')));
  const columnsAllowed = new Set([
    'id',
    'revision',
    'createdAt',
    'updatedAt',
    ...collection.fields.map((field) => field.path),
  ]);
  const locale = search.get('locale') ?? collection.locales[0] ?? 'en';
  const folder = search.get('folderId');
  const folderId = parseFolder(folder);
  const invalid = invalidQuery({
    search,
    collection,
    allowedSort,
    parsedSort,
    parsedWhere,
    folder,
    folderId,
    locale,
  });
  return {
    page: positive(search.get('page'), contentPolicy.maximumPage, 1),
    pageSize: positive(
      search.get('pageSize'),
      contentPolicy.maximumPageSize,
      contentPolicy.pageSize,
    ),
    q: search.get('q') ?? '',
    locale,
    mode: search.get('mode') === 'published' ? 'published' : 'editing',
    trashed: search.get('trashed') === 'true',
    folderId,
    where: parsedWhere.success ? parsedWhere.data : undefined,
    sort: parsedSort.success ? parsedSort.data : [],
    columns: rawColumns.success
      ? rawColumns.data.filter((key) => columnsAllowed.has(key))
      : ['id', ...collection.fields.slice(0, 3).map((field) => field.path), 'updatedAt'],
    invalid,
  };
}
function parseFolder(value: string | null): string | null | undefined {
  if (value === null) return undefined;
  if (value === 'null') return null;
  return z.uuid().safeParse(value).success ? value : undefined;
}
function invalidQuery(input: {
  search: URLSearchParams;
  collection: Collection;
  allowedSort: ReadonlySet<string>;
  parsedSort: ReturnType<typeof sorts.safeParse>;
  parsedWhere: ReturnType<ReturnType<typeof whereSchema.optional>['safeParse']>;
  folder: string | null;
  folderId: string | null | undefined;
  locale: string;
}) {
  const { search, collection, allowedSort, parsedSort, parsedWhere, folder, folderId, locale } =
    input;
  return (
    !parsedSort.success ||
    parsedSort.data.some((sort) => !allowedSort.has(sort.field)) ||
    !parsedWhere.success ||
    (parsedWhere.data !== undefined && !validWhere(parsedWhere.data, collection)) ||
    (folder !== null && folderId === undefined) ||
    !collection.locales.includes(locale) ||
    (search.get('q')?.length ?? 0) > 256
  );
}

export function contentApiQuery(query: ContentQuery) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    locale: query.locale,
    fallback: [],
    depth: 0,
    mode: query.mode,
    trashed: query.trashed,
    ...(query.q ? { q: query.q } : {}),
    ...(query.where ? { where: query.where } : {}),
    ...(query.sort.length > 0 ? { sort: query.sort } : {}),
    ...(query.folderId !== undefined ? { folderId: query.folderId } : {}),
  };
}
export function changeContentQuery(
  collection: Collection,
  search: URLSearchParams,
  changes: Partial<ContentQuery>,
) {
  const current = parseContentQuery(search, collection);
  const next = { ...current, ...changes, page: changes.page ?? 1 };
  const out = new URLSearchParams();
  if (next.page !== 1) out.set('page', String(next.page));
  if (next.pageSize !== contentPolicy.pageSize) out.set('pageSize', String(next.pageSize));
  if (next.q) out.set('q', next.q);
  out.set('locale', next.locale);
  if (next.mode === 'published') out.set('mode', 'published');
  if (next.trashed) out.set('trashed', 'true');
  if (next.folderId !== undefined) out.set('folderId', String(next.folderId));
  if (next.where) out.set('where', JSON.stringify(next.where));
  if (next.sort.length > 0) out.set('sort', JSON.stringify(next.sort));
  out.set('columns', JSON.stringify(next.columns));
  return `${collectionPath(collection.key)}?${out.toString()}`;
}
