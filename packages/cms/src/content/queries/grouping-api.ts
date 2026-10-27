import { createHash } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { z } from 'zod';
import { createRunner, parse } from '../runtime.ts';
import { readLocaleInput } from '../documents/all-locales.ts';
import { safeDefaultSort } from './default-sort.ts';
import { groupingContext } from './grouping-context.ts';
import { groupDocumentViews } from './grouping-pages.ts';
import { groupingLabels, groupingLabel } from './grouping-labels.ts';
import type { groupingInputSchemas } from './grouping-contracts.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { StoredJoinPage, DocumentView } from '../model.ts';
import type { JsonValue } from '../definition.ts';

type DistinctInput = z.infer<ReturnType<typeof groupingInputSchemas>['documents.distinct']>;
type GroupInput = z.infer<ReturnType<typeof groupingInputSchemas>['documents.groups']>;

function groupKey(collection: string, field: string, value: JsonValue): string {
  const bytes = createHash('sha256')
    .update(JSON.stringify([collection, field, value]))
    .digest();
  bytes[6] = ((bytes[6] ?? 0) & 15) | 80;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function distinctValues(state: ContentState, runtime: ContentRuntime, input: DistinctInput) {
  const { collection: _collection, field, order, ...values } = input;
  const context = await groupingContext(state, {
    runtime,
    query: { ...values, locale: state.locale, ...(input.locale === 'all' ? { fallback: [] } : {}) },
  });
  return runtime.store.queryDistinct(state.tx, {
    collection: state.collection.key,
    query: context.query,
    queryableFields: context.queryableFields,
    valueReadableFields: context.valueReadableFields,
    relationScopes: context.relationScopes,
    field,
    order,
    limits: runtime.limits,
  });
}

async function groupedDocuments(state: ContentState, runtime: ContentRuntime, input: GroupInput) {
  const {
    collection: _collection,
    groupBy,
    groupPageSize: _groupPageSize,
    queryByGroup: _queryByGroup,
    ...values
  } = input;
  const context = await groupingContext(state, {
    runtime,
    query: { ...values, locale: state.locale, ...(input.locale === 'all' ? { fallback: [] } : {}) },
  });
  const distinct = await runtime.store.queryDistinct(state.tx, {
    collection: state.collection.key,
    query: context.query,
    queryableFields: context.queryableFields,
    valueReadableFields: context.valueReadableFields,
    relationScopes: context.relationScopes,
    ...groupBy,
    limits: runtime.limits,
  });
  const { groups, pages } = await groupedPages(state, runtime, { context, distinct, input });
  const views = await groupDocumentViews(context.reader, {
    runtime,
    query: context.query,
    pages,
    allLocales: input.locale === 'all',
  });
  const labels = await groupingLabels(context.reader, {
    runtime,
    field: groupBy.field,
    values: distinct.rows,
    relationScopes: context.relationScopes,
  });
  const rows = groupedRows({ groups, pages, views, labels });
  const result = { rows, total: distinct.total, page: distinct.page, pageSize: distinct.pageSize };
  if (Buffer.byteLength(JSON.stringify(result)) > runtime.limits.maxResponseBytes)
    fail('capacity_exceeded');
  return result;
}

async function groupedPages(
  state: ContentState,
  runtime: ContentRuntime,
  options: {
    context: Awaited<ReturnType<typeof groupingContext>>;
    distinct: Awaited<ReturnType<ContentRuntime['store']['queryDistinct']>>;
    input: GroupInput;
  },
) {
  const {
    context,
    distinct,
    input: { groupBy, groupPageSize, queryByGroup },
  } = options;
  const sort =
    context.query.sort ??
    safeDefaultSort(
      state.collection,
      context.queryableFields.filter((path) => context.valueReadableFields.includes(path)),
    );
  const groups = distinct.rows.map((value) => {
    const key = groupKey(state.collection.id, groupBy.field, value);
    return { key, value, ...queryByGroup?.[key] };
  });
  const pages = await runtime.store.queryJoinedDocuments(state.tx, {
    groups: groups.map((group) => ({
      key: group.key,
      ...(group.page ? { page: group.page } : {}),
      ...(group.pageSize ? { pageSize: group.pageSize } : {}),
      collections: [
        {
          collection: state.collection.key,
          query: context.query,
          queryableFields: context.queryableFields,
          valueReadableFields: context.valueReadableFields,
          relationScopes: context.relationScopes,
          grouping: { field: groupBy.field, value: group.value },
        },
      ],
    })),
    sort,
    page: 1,
    pageSize: groupPageSize,
    count: true,
    maxRows: runtime.limits.maxExpandNodes,
    limits: runtime.limits,
  });
  return { groups, pages };
}

function groupedRows(input: {
  groups: readonly { key: string; value: JsonValue }[];
  pages: ReadonlyMap<string, StoredJoinPage>;
  views: ReadonlyMap<string, DocumentView>;
  labels: ReadonlyMap<string, string>;
}) {
  const { groups, pages, views, labels } = input;
  const rows = groups.map((group) => {
    const page = pages.get(group.key);
    if (page?.total === undefined) fail('temporarily_unavailable');
    const label = groupingLabel(labels, group.value);
    return {
      key: group.key,
      value: group.value,
      ...(label === undefined ? {} : { label }),
      documents: {
        rows: page.rows.map((row) => {
          const view = views.get(row.document.id);
          if (!view) fail('temporarily_unavailable');
          return view;
        }),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      },
    };
  });
  return rows;
}

export function createGroupingApi(runtime: ContentRuntime) {
  return {
    distinctDocuments: (ctx: RequestContext, raw: unknown) => {
      const input = parse(runtime.schemas['documents.distinct'], raw);
      return createRunner(runtime)(
        {
          ctx,
          operationId: 'documents.distinct',
          collection: input.collection,
          mode: input.mode,
          ...readLocaleInput(input.locale, input.fallback),
          ...(input.fallback ? { fallbackOverride: input.fallback } : {}),
        },
        (state) => distinctValues(state, runtime, input),
      );
    },
    groupDocuments: (ctx: RequestContext, raw: unknown) => {
      const input = parse(runtime.schemas['documents.groups'], raw);
      return createRunner(runtime)(
        {
          ctx,
          operationId: 'documents.groups',
          collection: input.collection,
          mode: input.mode,
          ...readLocaleInput(input.locale, input.fallback),
          ...(input.fallback ? { fallbackOverride: input.fallback } : {}),
        },
        (state) => groupedDocuments(state, runtime, input),
      );
    },
  };
}
