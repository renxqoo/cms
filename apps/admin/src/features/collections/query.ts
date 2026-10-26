import { z } from 'zod';
import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import { fieldValue, isFieldData } from '../fields/data';
import type { JsonValue } from '../fields/types';

const positive = (value: string | null, fallback: number, maximum: number) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= maximum ? number : fallback;
};
export function collectionHref(collection: string, id?: string) {
  return `/dashboard/collections/${encodeURIComponent(collection)}${id ? `/${encodeURIComponent(id)}` : ''}`;
}
export function parseDocumentQuery(params: URLSearchParams, collection: Collection | null) {
  const locale = params.get('locale');
  const field = params.get('sort') ?? 'updatedAt';
  const allowedSort = [
    'id',
    'createdAt',
    'updatedAt',
    'revision',
    ...(collection?.fields.filter((item) => item.queryable).map((item) => item.path) ?? []),
  ];

  const query = {
    page: positive(params.get('page'), 1, 2_147_483_647),
    pageSize: positive(params.get('pageSize'), 20, 100),
    q: (params.get('q') ?? '').slice(0, 256),
    mode: params.get('mode') === 'published' ? 'published' : 'editing',
    trashed: params.get('trashed') === 'true',
    sort: allowedSort.includes(field) ? field : 'updatedAt',
    order: params.get('order') === 'asc' ? 'asc' : 'desc',
    locale:
      locale && collection?.locales.includes(locale) ? locale : (collection?.defaultLocale ?? ''),
    folderId: folderQuery(params.get('folderId')),
    filterField: params.get('filterField') ?? '',
    filterValue: params.get('filterValue') ?? '',
  };
  return query;
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
    page: Object.keys(changes).some((key) => key !== 'page') ? 1 : (changes.page ?? previous.page),
  };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (key === 'folderId' && value === null) params.set(key, 'root');
    else if (value !== undefined && value !== '' && value !== false) params.set(key, String(value));
  }
  return `${base}?${params}`;
}

export function queryFilter(query: DocumentQuery, collection: Collection | null) {
  if (!query.filterField) return { valid: true, where: undefined };
  const field = collection?.fields.find(
    (candidate) => candidate.path === query.filterField && candidate.queryable,
  );
  if (!field) return { valid: false, where: undefined };
  let value: unknown = query.filterValue;
  if (field.type === 'number') {
    if (!query.filterValue.trim() || !Number.isFinite(Number(query.filterValue)))
      return { valid: false, where: undefined };
    value = Number(query.filterValue);
  } else if (field.type === 'boolean') {
    if (!['true', 'false'].includes(query.filterValue)) return { valid: false, where: undefined };
    value = query.filterValue === 'true';
  }
  return { valid: true, where: { field: field.path, operator: 'eq', value } };
}
export function documentTitle(document: Document, collection?: Collection) {
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
