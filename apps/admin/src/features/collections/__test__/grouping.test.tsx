import { pageApi, resetPageApi, defaultPageRequest, ok } from './page-fixture';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderManagement,
  ManagementTestProvider,
} from '../../../../../../test/support/admin-management';
import { catalog, document, documentId, folderId, versionId } from './support';
import { parseDocumentQuery, documentQueryHref } from '../query';
import { DocumentGroupedTables } from '../document-groups';
import { GroupingControl } from '../grouping-control';
import { DocumentListPage } from '../list-page';
import { deferred } from './support';
import type { PageRequest } from './page-fixture';
import type { ApiResult } from '../../../api/result';
import type { DocumentGroups } from '../../../contracts/document-groups';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test control');
  return value;
}
beforeEach(resetPageApi);
const collection = catalog();
collection.fields[0] = { ...required(collection.fields[0]), groupable: true };
const groupBy = { field: 'title', order: 'asc' };
function query() {
  return parseDocumentQuery(
    new URLSearchParams({ groupBy: JSON.stringify(groupBy), page: '3' }),
    collection,
  );
}

it('keeps group pagination independent of outer pages and clears stale group cursors when filtering changes', () => {
  const previous = { ...query(), queryByGroup: { [documentId]: { page: 9 } } };
  const href = documentQueryHref('/list', previous, {
    queryByGroup: { [documentId]: { page: 2 } },
  });
  const parsed = parseDocumentQuery(new URL(href, 'http://localhost').searchParams, collection);
  expect(parsed).toMatchObject({ page: 3, groupBy, queryByGroup: { [documentId]: { page: 2 } } });
  for (const patch of [
    { q: 'fresh' },
    { locale: 'zh-CN' },
    { groupBy: { field: 'title', order: 'desc' as const } },
  ]) {
    const params = new URL(documentQueryHref('/list', previous, patch), 'http://localhost')
      .searchParams;
    expect(params.get('page')).toBe('1');
    expect(params.has('queryByGroup')).toBe(false);
  }
  const disabled = catalog({
    fields: [
      {
        ...required(collection.fields[0]),
        disabled: { field: false, column: false, filter: false, bulkEdit: false, groupBy: true },
      },
    ],
  });
  expect(
    parseDocumentQuery(new URLSearchParams({ groupBy: JSON.stringify(groupBy) }), disabled).groupBy,
  ).toBeNull();
  expect(parseDocumentQuery(new URLSearchParams('groupBy=bad'), collection).groupBy).toBeNull();
});

it('shows group values safely and updates only a visible group page while pruning stale keys', async () => {
  const change = vi.fn<(...args: unknown[]) => void>();
  const groups: DocumentGroups = {
    rows: [
      {
        key: documentId,
        value: null,
        documents: { rows: [document()], page: 1, pageSize: 1, total: 2 },
      },
      {
        key: versionId,
        value: { collection: 'pages', id: folderId },
        label: 'Authorized page',
        documents: { rows: [], page: 1, pageSize: 1, total: 0 },
      },
    ],
    page: 3,
    pageSize: 1,
    total: 4,
  };
  renderManagement(
    <DocumentGroupedTables
      groups={groups}
      collection={collection}
      query={{ ...query(), pageSize: 1, queryByGroup: { [folderId]: { page: 9 } } }}
      change={change}
      columns={() => [
        {
          key: 'title',
          header: 'Title',
          cell: (row) => (typeof row.data['title'] === 'string' ? row.data['title'] : 'No title'),
        },
      ]}
      loading={false}
      error={null}
      reload={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: 'Collapse group: Authorized page' })).toBeVisible();
  expect(screen.queryByText(folderId)).not.toBeInTheDocument();
  const first = screen
    .getByRole('button', { name: 'Collapse group: No value' })
    .closest('[data-slot="card"]');
  if (!(first instanceof HTMLElement)) throw new Error('Missing group card');
  await userEvent.click(within(first).getByRole('button', { name: 'Next' }));
  expect(change).toHaveBeenLastCalledWith({
    queryByGroup: { [documentId]: { page: 2, pageSize: 1 } },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Collapse group: No value' }));
  expect(screen.queryByText('Server title')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Expand group: No value' }));
  expect(screen.getByText('Server title')).toBeVisible();
  expect(screen.getByText(/4 groups/)).toBeVisible();
});

it('reports first-load group errors with retry and offers grouping only to authorized fields', async () => {
  const reload = vi.fn<() => void>();
  const change = vi.fn<(...args: unknown[]) => void>();
  const rendered = renderManagement(
    <>
      <GroupingControl collection={collection} query={query()} change={change} />
      <DocumentGroupedTables
        groups={null}
        collection={collection}
        query={query()}
        change={change}
        columns={() => []}
        loading={false}
        error="Failed to load"
        reload={reload}
      />
    </>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Failed to load');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(reload).toHaveBeenCalledOnce();
  fireEvent.change(required(screen.getAllByRole('combobox', { name: 'Group by' })[1]), {
    target: { value: 'desc' },
  });
  expect(change).toHaveBeenLastCalledWith({ groupBy: { field: 'title', order: 'desc' } });
  pageApi.denied.add('documents.groups');
  rendered.rerender(
    <ManagementTestProvider>
      <GroupingControl collection={collection} query={query()} change={change} />
    </ManagementTestProvider>,
  );
  expect(screen.queryByRole('combobox', { name: 'Group by' })).not.toBeInTheDocument();
});

it('loads grouped server pages and cancels stale locale requests without falling back to an ordinary list', async () => {
  const pending = deferred<ApiResult<unknown>>();
  const requested: PageRequest[] = [];
  pageApi.search = new URLSearchParams({
    groupBy: JSON.stringify(groupBy),
    locale: 'en',
  }).toString();
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'collections.get') return Promise.resolve(ok(collection));
    if (input.operation === 'documents.groups') {
      requested.push(input);
      if (input.query?.locale === 'en') return pending.promise;
      return Promise.resolve(
        ok({
          rows: [
            {
              key: documentId,
              value: '中文',
              documents: {
                rows: [document({ data: { title: '中文文档' } })],
                page: 1,
                pageSize: 20,
                total: 1,
              },
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      );
    }
    return defaultPageRequest(input);
  });
  const view = renderManagement(<DocumentListPage collectionKey="articles" />);
  await waitFor(() => expect(requested).toHaveLength(1));
  pageApi.search = new URLSearchParams({
    groupBy: JSON.stringify(groupBy),
    locale: 'zh-CN',
  }).toString();
  view.rerender(
    <ManagementTestProvider>
      <DocumentListPage collectionKey="articles" />
    </ManagementTestProvider>,
  );
  await screen.findByRole('button', { name: '中文文档' });
  expect(requested[0]?.signal.aborted).toBe(true);
  pending.resolve(
    ok({
      rows: [
        {
          key: documentId,
          value: 'Old',
          documents: { rows: [document()], page: 1, pageSize: 20, total: 1 },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
  );
  await waitFor(() => expect(screen.queryByText('Server title')).not.toBeInTheDocument());
  expect(pageApi.request.mock.calls.some(([input]) => input.operation === 'documents.list')).toBe(
    false,
  );
  expect(requested.at(-1)?.query).toMatchObject({
    locale: 'zh-CN',
    groupBy,
    fallback: [],
    depth: 0,
  });
});

it('renders localized option groups, JSON values, empty results and loading state while preserving search and page size changes', async () => {
  const configured = catalog({
    fields: [
      {
        ...required(collection.fields[0]),
        type: 'select',
        options: [{ value: 'red', label: { en: 'Red label', zh: '红色' } }],
      },
    ],
  });
  const change = vi.fn<(...args: unknown[]) => void>();
  const props = {
    groups: {
      rows: [
        { key: documentId, value: 'red', documents: { rows: [], page: 1, pageSize: 10, total: 0 } },
        {
          key: versionId,
          value: { x: 1 },
          documents: { rows: [], page: 1, pageSize: 10, total: 0 },
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    },
    collection: configured,
    query: query(),
    change,
    columns: () => [],
    loading: false,
    error: null,
    reload: () => {},
  };
  const view = renderManagement(<DocumentGroupedTables {...props} />, 'zh');
  expect(screen.getByRole('button', { name: '收起分组: 红色' })).toBeVisible();
  expect(screen.getByRole('button', { name: '收起分组: {"x":1}' })).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索记录' }), {
    target: { value: 'Fresh' },
  });
  await userEvent.click(screen.getByRole('button', { name: '搜索' }));
  expect(change).toHaveBeenLastCalledWith({ q: 'Fresh' });
  view.rerender(
    <ManagementTestProvider>
      <DocumentGroupedTables {...props} groups={null} loading />
    </ManagementTestProvider>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('正在加载…');
  view.rerender(
    <ManagementTestProvider>
      <DocumentGroupedTables {...props} groups={{ rows: [], total: 0, page: 1, pageSize: 20 }} />
    </ManagementTestProvider>,
  );
  expect(screen.getByText('没有匹配的分组')).toBeVisible();
});
