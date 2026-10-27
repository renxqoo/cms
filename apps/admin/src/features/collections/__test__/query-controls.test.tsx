import {
  pageApi,
  resetPageApi,
  collection,
  recordId,
  secondId,
  date,
  ok,
  defaultPageRequest,
} from './page-fixture';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { contentMessages } from '../messages';
import { FilterBuilder } from '../filter-builder';
import { SortBuilder } from '../sort-builder';
import { QueryPresetManager } from '../query-presets';
import { parseDocumentQuery } from '../query';
import { failure } from '../../../api/result';
import { presetPreview } from './preset-ui-support';
import type { PageRequest } from './page-fixture';
import { privatePresetAccess } from '../preset-access-editor';
import type { QueryPreset } from '../../../contracts/query-presets';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected control');
  return value;
}

function presetRequest(input: PageRequest) {
  return input.operation === 'queryPresets.preview'
    ? Promise.resolve(presetPreview(input))
    : defaultPageRequest(input);
}
beforeEach(() => {
  resetPageApi();
  pageApi.request.mockImplementation(presetRequest);
});
afterEach(() => vi.resetAllMocks());

it('builds typed AND/OR conditions and preserves invalid input until the editor fixes it', async () => {
  const onApply = vi.fn<(...args: unknown[]) => void>();
  const configured = {
    ...collection,
    fields: [
      ...collection.fields,
      {
        id: 'score',
        path: 'score',
        type: 'number',
        label: 'Score',
        required: false,
        localized: false,
        queryable: true,
        sortable: true,
      },
    ],
  };
  renderManagement(
    <FilterBuilder
      collection={configured}
      value={undefined}
      t={contentMessages.en}
      onApply={onApply}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter field' }), {
    target: { value: 'score' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter value' }), {
    target: { value: 'bad' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Apply filter' }));
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Filter value' })).toHaveValue('bad');
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter value' }), {
    target: { value: '0' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Add group' }));
  const [, group] = screen.getAllByRole('group');
  if (!group) throw new Error('Expected nested filter group');
  await userEvent.click(within(group).getByRole('button', { name: 'Add condition' }));
  fireEvent.change(within(group).getByRole('combobox', { name: 'Filter field' }), {
    target: { value: 'title' },
  });
  fireEvent.change(within(group).getByRole('textbox', { name: 'Filter value' }), {
    target: { value: 'News' },
  });
  await userEvent.click(within(group).getByRole('button', { name: 'Add condition' }));
  fireEvent.change(required(within(group).getAllByRole('combobox', { name: 'Filter field' })[1]), {
    target: { value: 'title' },
  });
  fireEvent.change(required(within(group).getAllByRole('textbox', { name: 'Filter value' })[1]), {
    target: { value: 'Editorial' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Apply filter' }));
  expect(onApply).toHaveBeenCalledWith({
    and: [
      { field: 'score', operator: 'eq', value: 0 },
      {
        or: [
          { field: 'title', operator: 'eq', value: 'News' },
          { field: 'title', operator: 'eq', value: 'Editorial' },
        ],
      },
    ],
  });
  await userEvent.click(required(within(group).getAllByRole('button', { name: 'Remove' })[0]));
  expect(within(group).getAllByRole('textbox', { name: 'Filter value' })).toHaveLength(1);
});

it('changes comparison operators, clears filters and prioritizes multiple sort fields', async () => {
  const apply = vi.fn<(...args: unknown[]) => void>();
  const filter = renderManagement(
    <FilterBuilder
      collection={collection}
      value={{ field: 'title', operator: 'eq', value: 'News' }}
      t={contentMessages.en}
      onApply={apply}
    />,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Comparison' }), {
    target: { value: 'like' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Apply filter' }));
  expect(apply).toHaveBeenLastCalledWith({ field: 'title', operator: 'like', value: 'News' });
  await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
  expect(apply).toHaveBeenLastCalledWith();
  filter.unmount();
  renderManagement(
    <SortBuilder
      collection={collection}
      value={[{ field: 'title', order: 'asc' }]}
      onApply={apply}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Add sort field' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Comparison 2' }), {
    target: { value: 'desc' },
  });
  await userEvent.click(required(screen.getAllByRole('button', { name: 'Move earlier' })[1]));
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(apply).toHaveBeenLastCalledWith([
    { field: 'id', order: 'desc' },
    { field: 'title', order: 'asc' },
  ]);
  await userEvent.click(required(screen.getAllByRole('button', { name: 'Remove' })[1]));
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort 1' }), {
    target: { value: 'updatedAt' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(apply).toHaveBeenLastCalledWith([{ field: 'updatedAt', order: 'desc' }]);
});

function preset(overrides: Partial<QueryPreset> = {}): QueryPreset {
  return {
    id: recordId,
    collection: 'articles',
    ownerId: recordId,
    name: 'Editorial',
    shared: false,
    access: privatePresetAccess(recordId),
    permissions: { read: true, update: true, delete: true },
    query: { q: 'News', sort: [{ field: 'title', order: 'asc' }], columns: ['title'] },
    version: 1,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

it('loads saved views only when opened and applies the server filter, order and columns', async () => {
  pageApi.request.mockImplementation((input) =>
    input.operation === 'queryPresets.list'
      ? Promise.resolve(ok({ rows: [preset()], total: 1, page: 1, pageSize: 20 }))
      : presetRequest(input),
  );
  const apply = vi.fn<(...args: unknown[]) => void>();
  renderManagement(
    <QueryPresetManager
      collection={collection}
      query={parseDocumentQuery(new URLSearchParams(), collection)}
      columns={[]}
      onApply={apply}
    />,
  );
  expect(pageApi.request).not.toHaveBeenCalled();
  const trigger = screen.getByRole('button', { name: 'Saved views' });
  await userEvent.click(trigger);
  await screen.findByText('Editorial · Private');
  await userEvent.click(screen.getByRole('button', { name: 'Apply view' }));
  expect(apply).toHaveBeenCalledWith({
    q: 'News',
    where: '',
    groupBy: null,
    queryByGroup: undefined,
    sort: [{ field: 'title', order: 'asc' }],
    columns: ['title'],
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it('regression: saves, renames, shares and deletes views under the selected content locale', async () => {
  let row: QueryPreset | null = preset();
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'queryPresets.list')
      return Promise.resolve(
        ok({ rows: row ? [row] : [], total: row ? 1 : 0, page: 1, pageSize: 20 }),
      );
    if (input.operation === 'queryPresets.create') {
      row = preset({ id: secondId, name: 'Saved' });
      return Promise.resolve(ok(row));
    }
    if (input.operation === 'queryPresets.update') {
      row = preset({ id: secondId, name: 'Renamed', version: 2 });
      return Promise.resolve(ok(row));
    }
    if (input.operation === 'queryPresets.share') {
      row = preset({
        id: secondId,
        name: 'Renamed',
        version: 3,
        shared: true,
        access: { ...privatePresetAccess(recordId), read: { constraint: 'everyone' } },
      });
      return Promise.resolve(ok(row));
    }
    if (input.operation === 'queryPresets.delete') {
      row = null;
      return Promise.resolve({ ok: true, status: 204, data: undefined, requestId: '' });
    }
    return presetRequest(input);
  });
  renderManagement(
    <QueryPresetManager
      collection={collection}
      query={parseDocumentQuery(new URLSearchParams('locale=zh-CN'), collection)}
      columns={['title']}
      onApply={vi.fn<(...args: unknown[]) => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Saved views' }));
  await screen.findByText('Editorial · Private');
  fireEvent.change(screen.getByRole('textbox', { name: 'View name' }), {
    target: { value: 'Saved' },
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save current view' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save current view' }));
  await screen.findByText('Saved · Private');
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'queryPresets.create')?.[0],
  ).toMatchObject({
    params: { collection: 'articles' },
    body: {
      name: 'Saved',
      access: privatePresetAccess(recordId),
      locale: 'zh-CN',
      query: { q: '', columns: ['title'] },
    },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Replace with current view' }));
  fireEvent.change(required(screen.getAllByRole('textbox', { name: 'View name' })[1]), {
    target: { value: 'Renamed' },
  });
  await userEvent.click(
    required(screen.getAllByRole('button', { name: 'Replace with current view' })[1]),
  );
  await screen.findByText('Renamed · Private');
  const article = screen.getByText('Renamed · Private').closest('article');
  if (!article) throw new Error('Expected saved view');
  await userEvent.click(
    within(article).getByRole('button', { name: 'Share with this collection' }),
  );
  fireEvent.change(within(article).getByRole('combobox', { name: 'Read view' }), {
    target: { value: 'everyone' },
  });
  await waitFor(() =>
    expect(within(article).getByRole('button', { name: 'Save current view' })).toBeEnabled(),
  );
  await userEvent.click(within(article).getByRole('button', { name: 'Save current view' }));
  await screen.findByText('Renamed · Share with this collection');
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'queryPresets.share')?.[0]
      .body,
  ).toEqual({
    version: 2,
    access: { ...privatePresetAccess(recordId), read: { constraint: 'everyone' } },
    locale: 'zh-CN',
  });
  await userEvent.click(screen.getByRole('button', { name: 'Delete view' }));
  await userEvent.click(screen.getByRole('button', { name: 'Delete view · Renamed' }));
  await screen.findByText('No saved views.');
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'queryPresets.list')?.[0]
      .query,
  ).toMatchObject({ locale: 'zh-CN' });
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'queryPresets.update')?.[0]
      .body,
  ).toMatchObject({ locale: 'zh-CN' });
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'queryPresets.delete')?.[0]
      .query,
  ).toEqual({ version: 3, locale: 'zh-CN' });
});

it('keeps a conflicting preset locked until current server views are read and respects denied access', async () => {
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'queryPresets.list')
      return Promise.resolve(ok({ rows: [preset()], total: 1, page: 1, pageSize: 20 }));
    if (input.operation === 'queryPresets.share')
      return Promise.resolve(failure('version_conflict', 409));
    return presetRequest(input);
  });
  const view = renderManagement(
    <QueryPresetManager
      collection={collection}
      query={parseDocumentQuery(new URLSearchParams(), collection)}
      columns={[]}
      onApply={vi.fn<(...args: unknown[]) => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Saved views' }));
  await screen.findByText('Editorial · Private');
  const article = screen.getByText('Editorial · Private').closest('article');
  if (!article) throw new Error('Expected saved view');
  await userEvent.click(
    within(article).getByRole('button', { name: 'Share with this collection' }),
  );
  fireEvent.change(within(article).getByRole('combobox', { name: 'Read view' }), {
    target: { value: 'everyone' },
  });
  await waitFor(() =>
    expect(within(article).getByRole('button', { name: 'Save current view' })).toBeEnabled(),
  );
  await userEvent.click(within(article).getByRole('button', { name: 'Save current view' }));
  await screen.findByRole('button', { name: 'Read current saved views' });
  expect(within(article).getByRole('button', { name: 'Delete view' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Read current saved views' }));
  await waitFor(() =>
    expect(within(article).getByRole('button', { name: 'Delete view' })).toBeEnabled(),
  );
  view.unmount();
  pageApi.denied.add('queryPresets.list');
  renderManagement(
    <QueryPresetManager
      collection={collection}
      query={parseDocumentQuery(new URLSearchParams(), collection)}
      columns={[]}
      onApply={vi.fn<(...args: unknown[]) => void>()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Saved views' })).not.toBeInTheDocument();
});

it('honors server row permissions for owners and allows authorized nonowners without an owner shortcut', async () => {
  let row = preset({ permissions: { read: true, update: false, delete: false } });
  pageApi.request.mockImplementation((input) =>
    input.operation === 'queryPresets.list'
      ? Promise.resolve(ok({ rows: [row], total: 1, page: 1, pageSize: 20 }))
      : presetRequest(input),
  );
  const view = renderManagement(
    <QueryPresetManager
      collection={collection}
      query={parseDocumentQuery(new URLSearchParams(), collection)}
      columns={[]}
      onApply={vi.fn<(...values: unknown[]) => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Saved views' }));
  await screen.findByText('Editorial · Private');
  expect(screen.queryByRole('button', { name: 'Replace with current view' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete view' })).toBeNull();
  view.unmount();
  row = preset({ ownerId: secondId, permissions: { read: true, update: true, delete: true } });
  renderManagement(
    <QueryPresetManager
      collection={collection}
      query={parseDocumentQuery(new URLSearchParams(), collection)}
      columns={[]}
      onApply={vi.fn<(...values: unknown[]) => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Saved views' }));
  await screen.findByText('Editorial · Private');
  expect(screen.getByRole('button', { name: 'Replace with current view' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Delete view' })).toBeEnabled();
});

it('pages saved views without losing the content locale and keeps disabled preset collections inactive', async () => {
  pageApi.request.mockImplementation((input) =>
    input.operation === 'queryPresets.list'
      ? Promise.resolve(
          ok({ rows: [preset()], total: 21, page: input.query?.['page'] ?? 1, pageSize: 20 }),
        )
      : presetRequest(input),
  );
  const view = renderManagement(
    <QueryPresetManager
      collection={collection}
      query={parseDocumentQuery(new URLSearchParams('locale=zh-CN'), collection)}
      columns={[]}
      onApply={vi.fn<(...values: unknown[]) => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Saved views' }));
  await screen.findByText('Editorial · Private');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls.some(
        ([request]) =>
          request.operation === 'queryPresets.list' &&
          request.query?.['page'] === 2 &&
          request.query?.['locale'] === 'zh-CN',
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Page 1');
  view.unmount();
  const count = pageApi.request.mock.calls.length;
  renderManagement(
    <QueryPresetManager
      collection={{ ...collection, enableQueryPresets: false }}
      query={parseDocumentQuery(new URLSearchParams(), collection)}
      columns={[]}
      onApply={vi.fn<(...values: unknown[]) => void>()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Saved views' })).toBeNull();
  expect(pageApi.request).toHaveBeenCalledTimes(count);
});
