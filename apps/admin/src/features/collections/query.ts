import { z } from 'zod';
import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import { fieldValue, isFieldData } from '../fields/data';
import type { JsonValue } from '../fields/types';
import { validateFilter } from './query-filter';
import type { DocumentSort } from './query-filter';
import { readGroupingQuery, groupedQueryHrefValue } from './grouping-query';

const positive = (value: string | null, fallback: number, maximum: number) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= maximum ? number : fallback;
};
export function collectionHref(collection: string, id?: string) {
  return `/dashboard/collections/${encodeURIComponent(collection)}${id ? `/${encodeURIComponent(id)}` : ''}`;
}
export function parseDocumentQuery(params: URLSearchParams, collection: Collection | null) {
  const locale = params.get('locale');
  const allowedSort = allowedSortFields(collection);

  const query = {
    page: positive(params.get('page'), 1, 2_147_483_647),
    pageSize: documentPageSize(params, collection),
    q: (params.get('q') ?? '').slice(0, 256),
    mode: params.get('mode') === 'published' ? 'published' : 'editing',
    trashed: params.get('trashed') === 'true',
    sort: readSort(
      params.get('sort'),
      allowedSort,
      collection?.defaultSort ?? [{ field: 'updatedAt', order: 'desc' }],
    ),
    locale:
      locale && collection?.locales.includes(locale) ? locale : (collection?.defaultLocale ?? ''),
    folderId: folderQuery(params.get('folderId')),
    where: params.get('where') ?? '',
    columns: readColumns(params.get('columns'), collection),
  };
  return { ...query, ...readGroupingQuery(params, collection, query.pageSize) };
}
function documentPageSize(params: URLSearchParams, collection: Collection | null) {
  return positive(params.get('pageSize'), collection?.admin?.pagination?.defaultLimit ?? 20, 100);
}
function allowedSortFields(collection: Collection | null) {
  return [
    'id',
    'createdAt',
    'updatedAt',
    'revision',
    ...(collection?.orderable ? ['_order'] : []),
    ...(collection?.fields
      .filter((item) => item.queryable && item.sortable)
      .map((item) => item.path) ?? []),
  ];
}

export type DocumentQuery = ReturnType<typeof parseDocumentQuery>;

export function documentQueryHref(
  base: string,
  previous: DocumentQuery,
  changes: Partial<DocumentQuery>,
) {
  const next = {
    ...previous,
    ...changes,
    page: Object.keys(changes).some(
      (key) => !['page', 'queryByGroup', 'groupPageSize'].includes(key),
    )
      ? 1
      : (changes.page ?? previous.page),
    queryByGroup: Object.keys(changes).some(
      (key) => !['page', 'queryByGroup', 'columns'].includes(key),
    )
      ? undefined
      : (changes.queryByGroup ?? previous.queryByGroup),
  };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    const grouping = groupedQueryHrefValue(key, value);
    if (key === 'folderId' && value === null) params.set(key, 'root');
    else if (grouping) params.set(key, grouping);
    else if (Array.isArray(value)) params.set(key, JSON.stringify(value));
    else if (
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
      value !== '' &&
      value !== false
    )
      params.set(key, String(value));
  }
  return `${base}?${params}`;
}

export function queryFilter(query: DocumentQuery, collection: Collection | null) {
  if (!query.where) return { valid: true, where: undefined };
  try {
    const where: unknown = JSON.parse(query.where);
    return validateFilter(where, collection)
      ? { valid: true, where }
      : { valid: false, where: undefined };
  } catch {
    return { valid: false, where: undefined };
  }
}

function readSort(
  value: string | null,
  allowed: string[],
  fallback: DocumentSort[],
): DocumentSort[] {
  if (value) {
    try {
      const sort = z
        .array(z.strictObject({ field: z.string(), order: z.enum(['asc', 'desc']) }))
        .min(1)
        .max(allowed.length)
        .parse(JSON.parse(value) as unknown);
      if (
        sort.every((entry) => allowed.includes(entry.field)) &&
        new Set(sort.map((entry) => entry.field)).size === sort.length
      )
        return sort;
    } catch {}
  }
  const safe = fallback.filter((entry) => allowed.includes(entry.field));
  return safe.length > 0 ? safe : [{ field: 'updatedAt', order: 'desc' }];
}

function readColumns(value: string | null, collection: Collection | null): string[] | null {
  if (value === null) return null;
  try {
    const columns = z
      .array(z.string())
      .max(collection?.fields.length ?? 0)
      .parse(JSON.parse(value) as unknown);
    return [
      ...new Set(columns.filter((path) => collection?.fields.some((field) => field.path === path))),
    ];
  } catch {
    return null;
  }
}
export function documentTitle(document: Document, collection?: Collection) {
  if (collection?.admin?.useAsTitle) {
    const value = fieldValue(document.data, collection.admin.useAsTitle.split('.'));
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return document.id;
  }
  for (const field of collection?.fields ?? []) {
    const value = fieldValue(document.data, field.path.split('.'));
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return document.id;
}

export function displayField(document: Document, path: string, type?: string): string {
  const value = fieldValue(document.data, path.split('.'));
  if (value === undefined || value === null) return '—';
  if (type === 'richText') return richTextSummary(value).trim() || '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function richTextSummary(value: JsonValue): string {
  if (!isFieldData(value)) return '';
  if (value['type'] === 'text' && typeof value['text'] === 'string') return value['text'];
  const { children } = value;
  if (!Array.isArray(children)) return '';
  return children
    .map(richTextSummary)
    .join(value['version'] === 1 || value['type'] === 'list' ? '\n' : '');
}

function folderQuery(value: string | null) {
  if (value === 'root') return null;
  const folder = z.uuid().safeParse(value);
  return folder.success ? folder.data : undefined;
}
