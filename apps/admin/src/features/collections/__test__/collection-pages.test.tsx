import {
  pageApi,
  resetPageApi,
  collection,
  record,
  descriptor,
  recordId,
  secondId,
  date,
  oldVersion,
  ok,
  defaultPageRequest,
} from './page-fixture';
import { StrictMode } from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { CollectionCatalogPage } from '../catalog-page';
import { DocumentListPage } from '../list-page';
import { CollectionStructurePage } from '../structure-page';
import { referenceServices } from '../reference-services';
import { DocumentEditorPage } from '../editor-page';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
import { editorIntentSchema } from '../../../contracts/editor';
import type { Document } from '../../../contracts/documents';

beforeEach(resetPageApi);
afterEach(() => vi.resetAllMocks());

it('opens history from the detail header without loading versions in the editing workspace', async () => {
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  const title = await screen.findByRole('textbox', { name: /^Title\*?$/ });
  const heading = screen.getByRole('heading', { level: 1 });
  const header = heading.closest('header');
  if (!header) throw new Error('Document details must have a page header.');
  const history = within(header).getByRole('button', { name: 'Version history' });
  expect(within(header).getByRole('button', { name: 'Save' })).toBeInTheDocument();
  expect(pageApi.request.mock.calls.some(([input]) => input.operation === 'versions.list')).toBe(
    false,
  );
  expect(screen.queryByText(/^Revision 1 ·/)).not.toBeInTheDocument();
  await userEvent.click(history);
  await screen.findByText(/^Revision 1 ·/);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(history).toHaveFocus();
  expect(title).toHaveValue('Story');
});

it('opens only real catalog collections and keeps denied reads out of the client', async () => {
  pageApi.pathname = '/dashboard/collections';
  const view = renderManagement(<CollectionCatalogPage />);
  await screen.findByText('Articles');
  await userEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(pageApi.push).toHaveBeenCalledWith('/dashboard/collections/articles', undefined);
  view.unmount();
  pageApi.denied.add('collections.list');
  pageApi.request.mockClear();
  renderManagement(<CollectionCatalogPage />);
  expect(screen.getByText('Your account lacks the required read permission.')).toBeInTheDocument();
  expect(pageApi.request).not.toHaveBeenCalled();
});

it('shows actual catalog failures and retries without publishing manufactured collections', async () => {
  pageApi.request.mockResolvedValueOnce(failure('temporarily_unavailable', 503));
  renderManagement(<CollectionCatalogPage />);
  await screen.findByRole('alert');
  expect(screen.queryByText('Articles')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('Articles');
});

it('uses no-fallback list reads and navigates selected documents with their explicit locale', async () => {
  renderManagement(<DocumentListPage collectionKey="articles" />);
  await screen.findByRole('button', { name: 'Story' });
  const request = pageApi.request.mock.calls.find(
    ([input]) => input.operation === 'documents.list',
  )?.[0];
  expect(request?.query).toMatchObject({
    locale: 'en',
    fallback: [],
    depth: 0,
    mode: 'editing',
    trashed: false,
  });
  await userEvent.click(screen.getByRole('button', { name: 'Story' }));
  expect(pageApi.push).toHaveBeenCalledWith(
    `/dashboard/collections/articles/${recordId}?locale=en`,
    undefined,
  );
});

it('keeps search, typed filters, locale, mode and folder queries within the published HTTP contract', async () => {
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
      },
    ],
  };
  pageApi.request.mockImplementation((input) =>
    input.operation === 'collections.get'
      ? Promise.resolve(ok(configured))
      : defaultPageRequest(input),
  );
  renderManagement(<DocumentListPage collectionKey="articles" />);
  await screen.findByRole('button', { name: 'Story' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search records' }), {
    target: { value: 'Editorial' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Content language' }), {
    target: { value: 'zh-CN' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'View' }), {
    target: { value: 'published' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Folder' }), {
    target: { value: 'root' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter field' }), {
    target: { value: 'score' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter value' }), {
    target: { value: 'bad' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Apply filter' }));
  expect(
    screen.getByText('Invalid filter. Numbers, booleans, and JSON must match the field type.'),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter value' }), {
    target: { value: '0' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Apply filter' }));
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls.some(
        ([input]) =>
          input.operation === 'documents.list' &&
          JSON.stringify(input.query?.where) ===
            JSON.stringify({ field: 'score', operator: 'eq', value: 0 }),
      ),
    ).toBe(true),
  );
  const last = pageApi.request.mock.calls
    .filter(([input]) => input.operation === 'documents.list')
    .at(-1)?.[0].query;
  expect(last).toMatchObject({
    locale: 'zh-CN',
    mode: 'published',
    folderId: null,
    q: 'Editorial',
  });
});

it('does not offer creating an existing singleton and reports a denied document read', async () => {
  pageApi.request.mockImplementation((input) =>
    input.operation === 'collections.get'
      ? Promise.resolve(ok({ ...collection, singleton: true }))
      : defaultPageRequest(input),
  );
  const view = renderManagement(<DocumentListPage collectionKey="articles" />);
  await screen.findByRole('button', { name: 'Story' });
  expect(screen.queryByRole('button', { name: 'New document' })).not.toBeInTheDocument();
  view.unmount();
  pageApi.denied.add('documents.list');
  renderManagement(<DocumentListPage collectionKey="articles" />);
  await screen.findByText('Your account lacks the required read permission.');
});

it('shows only the returned safe structure and schema identifiers and allows returning to the list', async () => {
  pageApi.pathname = '/dashboard/collections/articles/structure';
  renderManagement(<CollectionStructurePage collectionKey="articles" />);
  await screen.findByText('mappingFingerprint');
  expect(screen.getByText(/"layout"/)).toHaveTextContent('Metadata');
  await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
  expect(pageApi.push).toHaveBeenCalledWith('/dashboard/collections/articles', undefined);
});

it('regression: late save responses preserve invalid JSON entered through the real field renderer', async () => {
  let current = record();
  let finish: ((result: ApiResult<Document>) => void) | undefined;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.update')
      return new Promise((resolve) => {
        finish = resolve;
      });
    if (input.operation === 'collections.editor') return Promise.resolve(ok(descriptor(current)));
    if (input.operation === 'documents.get') return Promise.resolve(ok(current));
    return defaultPageRequest(input);
  });
  renderManagement(
    <StrictMode>
      <DocumentEditorPage collectionKey="articles" documentId={recordId} />
    </StrictMode>,
  );
  await screen.findByRole('textbox', { name: 'Metadata' });
  fireEvent.change(screen.getByRole('textbox', { name: /^Title\*?$/ }), {
    target: { value: 'Sent title' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Metadata' }), {
    target: { value: '{invalid after submission' },
  });
  current = record({
    revision: 4,
    versionId: oldVersion,
    data: { title: 'Sent title', metadata: { count: 1 } },
  });
  await act(async () => {
    finish?.(ok(current));
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: 'Metadata' })).toHaveValue(
    '{invalid after submission',
  );
  expect(
    screen.getAllByText('Invalid JSON. This draft cannot be saved yet.').length,
  ).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.queryByText('Saved', { exact: true })).not.toBeInTheDocument();
});

it('keeps a server conflict distinct from editable drafts until the user explicitly reviews it', async () => {
  let current = record();
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.update') {
      current = record({ revision: 7, versionId: oldVersion, data: { title: 'Other editor' } });
      return Promise.resolve(failure('version_conflict', 409));
    }
    if (input.operation === 'collections.editor') return Promise.resolve(ok(descriptor(current)));
    if (input.operation === 'documents.get') return Promise.resolve(ok(current));
    return defaultPageRequest(input);
  });
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  await screen.findByRole('textbox', { name: /^Title\*?$/ });
  fireEvent.change(screen.getByRole('textbox', { name: /^Title\*?$/ }), {
    target: { value: 'My retained title' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Server content changed. Your draft is preserved.');
  expect(screen.getByRole('textbox', { name: /^Title\*?$/ })).toHaveValue('My retained title');
  await userEvent.click(
    screen.getByRole('button', { name: 'Keep draft and continue from latest' }),
  );
  expect(screen.getByRole('textbox', { name: /^Title\*?$/ })).toHaveValue('My retained title');
  expect(
    pageApi.request.mock.calls.filter(([input]) => input.operation === 'documents.update'),
  ).toHaveLength(1);
});

it('discovers the actual singleton identity before a direct new route can create another record', async () => {
  pageApi.pathname = '/dashboard/collections/articles/new';
  pageApi.request.mockImplementation((input) =>
    input.operation === 'collections.get'
      ? Promise.resolve(ok({ ...collection, singleton: true }))
      : defaultPageRequest(input),
  );
  renderManagement(<DocumentEditorPage collectionKey="articles" />);
  await screen.findByDisplayValue('Story');
  const read = pageApi.request.mock.calls.find(
    ([input]) => input.operation === 'documents.list',
  )?.[0];
  expect(read?.query).toMatchObject({
    mode: 'editing',
    page: 1,
    pageSize: 1,
    fallback: [],
    depth: 0,
  });
  expect(read?.query).not.toHaveProperty('q');
  expect(pageApi.request.mock.calls.some(([input]) => input.operation === 'documents.create')).toBe(
    false,
  );
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'documents.get')?.[0].params,
  ).toEqual({ collection: 'articles', id: recordId });
});

it('regression: a late save keeps an invalid rich-text structure draft and its field instance', async () => {
  let current = record({ data: { title: 'Story', body: { version: 1, children: [] } } });
  let finish: ((result: ApiResult<Document>) => void) | undefined;
  const richNode = {
    id: 'body',
    name: 'body',
    type: 'richText' as const,
    path: 'body',
    label: 'Body',
    required: false,
    localized: true,
    write: 'allowed' as const,
    constraints: {},
  };
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.update')
      return new Promise((resolve) => {
        finish = resolve;
      });
    if (input.operation === 'collections.editor')
      return Promise.resolve(
        ok(descriptor(current, { layout: [descriptor().layout[0] ?? richNode, richNode] })),
      );
    if (input.operation === 'documents.get') return Promise.resolve(ok(current));
    return defaultPageRequest(input);
  });
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  await screen.findByRole('textbox', { name: /^Title\*?$/ });
  await userEvent.click(screen.getByRole('button', { name: 'Structure editor' }));
  await screen.findByRole('textbox', { name: 'Body' });
  fireEvent.change(screen.getByRole('textbox', { name: /^Title\*?$/ }), {
    target: { value: 'Sent title' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  const field = screen.getByRole('textbox', { name: 'Body' });
  fireEvent.change(field, { target: { value: '{invalid rich structure' } });
  current = record({
    revision: 4,
    versionId: oldVersion,
    data: { title: 'Sent title', body: { version: 1, children: [] } },
  });
  await act(async () => {
    finish?.(ok(current));
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: 'Body' })).toBe(field);
  expect(field).toHaveValue('{invalid rich structure');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(
    screen.getAllByText(
      'The rich-text structure or link is invalid. This draft cannot be saved yet.',
    ).length,
  ).toBeGreaterThan(0);
});

it.each([
  { label: 'Publish', operation: 'documents.publish', destination: null, prompt: 'Confirm action' },
  {
    label: 'Unpublish',
    operation: 'documents.unpublish',
    destination: null,
    prompt: 'Confirm action',
  },
  {
    label: 'Copy document',
    operation: 'documents.copy',
    destination: `/dashboard/collections/articles/${secondId}`,
    prompt: 'Copy document',
  },
  {
    label: 'Move to trash',
    operation: 'documents.archive',
    destination: '/dashboard/collections/articles?trashed=true',
    prompt: 'Confirm action',
  },
] as const)(
  'confirms $label through the one document write channel and observes its actual result',
  async ({ label, operation, destination, prompt }) => {
    let current = record();
    pageApi.pathname = `/dashboard/collections/articles/${recordId}`;
    pageApi.request.mockImplementation((input) => {
      if (input.operation === operation) {
        current = record({
          revision: 4,
          versionId: oldVersion,
          id: operation === 'documents.copy' ? secondId : recordId,
          trashedAt: operation === 'documents.archive' ? date : null,
        });
        return Promise.resolve(ok(current));
      }
      if (input.operation === 'collections.editor')
        return Promise.resolve(
          ok(
            descriptor(current, {
              intent: editorIntentSchema.parse(input.query?.intent),
              locale: typeof input.query?.locale === 'string' ? input.query.locale : 'en',
            }),
          ),
        );
      if (input.operation === 'documents.get') return Promise.resolve(ok(current));
      return defaultPageRequest(input);
    });
    renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
    await screen.findByRole('textbox', { name: /^Title\*?$/ });
    if (label === 'Publish') await userEvent.click(screen.getByRole('button', { name: label }));
    else {
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: label }));
    }
    const dialog = await screen.findByRole('dialog', { name: prompt });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: prompt })).toBeEnabled());
    expect(pageApi.request.mock.calls.some(([input]) => input.operation === operation)).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: prompt }));
    await waitFor(() =>
      expect(pageApi.request.mock.calls.some(([input]) => input.operation === operation)).toBe(
        true,
      ),
    );
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(pageApi.replace.mock.calls.map(([href]) => href)).toEqual(
        destination === null ? [] : [destination],
      ),
    );
  },
);

it('reads an unknown manual save before allowing a reviewed rebase and never blindly repeats its PATCH', async () => {
  let current = record();
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.update') {
      current = record({
        revision: 4,
        versionId: oldVersion,
        data: { title: 'Possibly saved server result' },
      });
      return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
    }
    if (input.operation === 'collections.editor') return Promise.resolve(ok(descriptor(current)));
    if (input.operation === 'documents.get') return Promise.resolve(ok(current));
    return defaultPageRequest(input);
  });
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  await screen.findByRole('textbox', { name: /^Title\*?$/ });
  fireEvent.change(screen.getByRole('textbox', { name: /^Title\*?$/ }), {
    target: { value: 'My intended title' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('The action result is unconfirmed. Other writes are paused.');
  await userEvent.click(screen.getByRole('button', { name: 'Read latest server version' }));
  await screen.findByText(/Possibly saved server result/);
  expect(
    pageApi.request.mock.calls.filter(([input]) => input.operation === 'documents.update'),
  ).toHaveLength(1);
  await userEvent.click(
    screen.getByRole('button', { name: 'Keep draft and continue from latest' }),
  );
  expect(screen.getByRole('textbox', { name: /^Title\*?$/ })).toHaveValue('My intended title');
});

it('retries failed editor reads and discards conflicting drafts only through an explicit user choice', async () => {
  let failed = false;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'collections.get' && !failed) {
      failed = true;
      return Promise.resolve(failure('temporarily_unavailable', 503));
    }
    return defaultPageRequest(input);
  });
  const view = renderManagement(
    <DocumentEditorPage collectionKey="articles" documentId={recordId} />,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Read latest server version' }));
  await screen.findByRole('textbox', { name: /^Title\*?$/ });
  view.unmount();
  let current = record();
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.update') {
      current = record({
        revision: 8,
        versionId: oldVersion,
        data: { title: 'Reviewed server copy' },
      });
      return Promise.resolve(failure('version_conflict', 409));
    }
    if (input.operation === 'collections.editor') return Promise.resolve(ok(descriptor(current)));
    if (input.operation === 'documents.get') return Promise.resolve(ok(current));
    return defaultPageRequest(input);
  });
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  await screen.findByRole('textbox', { name: /^Title\*?$/ });
  fireEvent.change(screen.getByRole('textbox', { name: /^Title\*?$/ }), {
    target: { value: 'My unsaved title' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Discard draft and load latest' }),
  );
  expect(screen.getByRole('textbox', { name: /^Title\*?$/ })).toHaveValue('Reviewed server copy');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

it('protects unsaved editor input during locale changes and restores the draft after cancelling navigation', async () => {
  pageApi.pathname = `/dashboard/collections/articles/${recordId}`;
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  await screen.findByRole('textbox', { name: /^Title\*?$/ });
  fireEvent.change(screen.getByRole('textbox', { name: /^Title\*?$/ }), {
    target: { value: 'Keep this text' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Content language' }), {
    target: { value: 'zh-CN' },
  });
  const dialog = await screen.findByRole('dialog', { name: 'Leave unsaved changes?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: /^Title\*?$/ })).toHaveValue('Keep this text');
  expect(pageApi.push).not.toHaveBeenCalled();
});

it('creates a real document and navigates to the returned identity after confirmation', async () => {
  let current: Document | null = null;
  pageApi.pathname = '/dashboard/collections/articles/new';
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.create') {
      current = record({ id: secondId, data: { title: 'Newly created', metadata: null } });
      return Promise.resolve(ok(current, 201));
    }
    if (input.operation === 'collections.editor')
      return Promise.resolve(
        ok(
          descriptor(current, {
            intent: editorIntentSchema.parse(input.query?.intent),
            locale: typeof input.query?.locale === 'string' ? input.query.locale : 'en',
          }),
        ),
      );
    if (input.operation === 'documents.get' && current) return Promise.resolve(ok(current));
    return defaultPageRequest(input);
  });
  renderManagement(<DocumentEditorPage collectionKey="articles" />);
  await screen.findByRole('textbox', { name: /^Title\*?$/ });
  fireEvent.change(screen.getByRole('textbox', { name: /^Title\*?$/ }), {
    target: { value: 'Newly created' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(pageApi.replace).toHaveBeenCalledWith(
      `/dashboard/collections/articles/${secondId}`,
      undefined,
    ),
  );
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'documents.create')?.[0].body,
  ).toMatchObject({ locale: 'en', data: { title: 'Newly created' } });
});

it('uses real authorized reference identities and locale-safe pagination and reports read errors', async () => {
  const services = referenceServices([collection], pageApi.report);
  const { signal } = new AbortController();
  const page = await services.searchReferences({
    collections: ['articles'],
    collection: 'articles',
    query: 'Story',
    page: 2,
    locale: 'zh-CN',
    signal,
  });
  expect(page.rows).toEqual([{ id: recordId, collection: 'articles', label: 'Story' }]);
  expect(pageApi.request.mock.calls[0]?.[0].query).toEqual({
    q: 'Story',
    page: 2,
    pageSize: 20,
    locale: 'zh-CN',
    fallback: [],
    depth: 0,
    mode: 'editing',
  });
  await expect(
    services.searchReferences({
      collections: ['articles'],
      collection: 'media',
      query: '',
      page: 1,
      locale: 'en',
      signal,
    }),
  ).rejects.toThrow('Invalid reference collection');
  pageApi.request.mockResolvedValueOnce(failure('forbidden', 403));
  await expect(
    services.searchReferences({
      collections: ['articles'],
      collection: 'articles',
      query: '',
      page: 1,
      locale: 'en',
      signal,
    }),
  ).rejects.toThrow('forbidden');
  expect(pageApi.report).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
});

it('paginates the server total, sorts safe fields and opens bulk actions only for explicitly selected rows', async () => {
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.list') {
      const page = Number(input.query?.page ?? 1);
      const pageSize = Number(input.query?.pageSize ?? 20);
      return Promise.resolve(
        ok({ rows: [record({ data: { title: 'Selectable story' } })], page, pageSize, total: 31 }),
      );
    }
    return defaultPageRequest(input);
  });
  renderManagement(<DocumentListPage collectionKey="articles" />);
  await screen.findByRole('button', { name: 'Selectable story' });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
    target: { value: '10' },
  });
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls.some(
        ([input]) => input.operation === 'documents.list' && input.query?.pageSize === 10,
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Visible fields' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Title' }));
  await userEvent.click(screen.getByRole('button', { name: 'Title' }));
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls.some(
        ([input]) =>
          input.operation === 'documents.list' &&
          JSON.stringify(input.query?.sort).includes('title'),
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select document Selectable story' }));
  await userEvent.click(screen.getByRole('button', { name: 'Bulk actions' }));
  await screen.findByRole('dialog', { name: 'Bulk actions' });
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('button', { name: 'Bulk actions' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByText('Visible fields'));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Title' }));
  expect(screen.queryByRole('button', { name: 'Title' })).not.toBeInTheDocument();
});

it('exposes trash restore and purge controls without attempting ordinary editing reads', async () => {
  pageApi.search = 'trashed=true';
  pageApi.request.mockImplementation((input) =>
    input.operation === 'documents.list'
      ? Promise.resolve(
          ok({ rows: [record({ trashedAt: date })], page: 1, pageSize: 20, total: 1 }),
        )
      : defaultPageRequest(input),
  );
  renderManagement(<DocumentListPage collectionKey="articles" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Permanently delete' }));
  expect(await screen.findByRole('dialog', { name: 'Permanently delete' })).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Restore document' }));
  expect(await screen.findByRole('dialog', { name: 'Restore document' })).toBeInTheDocument();
  expect(
    pageApi.request.mock.calls.some(
      ([input]) => input.operation === 'documents.get' || input.operation === 'collections.editor',
    ),
  ).toBe(false);
});

it('autosaves an enabled draft only after its quiet window and stops when the confirmed data is clean', async () => {
  let current = record();
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.autosave') {
      current = record({
        revision: 4,
        versionId: oldVersion,
        data: { title: 'Autosaved title', metadata: { count: 1 } },
      });
      return Promise.resolve(ok(current));
    }
    if (input.operation === 'collections.editor')
      return Promise.resolve(
        ok(
          descriptor(current, {
            intent: editorIntentSchema.parse(input.query?.intent),
            locale: typeof input.query?.locale === 'string' ? input.query.locale : 'en',
          }),
        ),
      );
    if (input.operation === 'documents.get') return Promise.resolve(ok(current));
    return defaultPageRequest(input);
  });
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  await screen.findByRole('textbox', { name: /^Title\*?$/ });
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole('switch', { name: 'Autosave drafts' }));
    fireEvent.change(screen.getByRole('textbox', { name: /^Title\*?$/ }), {
      target: { value: 'Autosaved title' },
    });
    await act(() => vi.advanceTimersByTimeAsync(9999));
    expect(
      pageApi.request.mock.calls.some(([input]) => input.operation === 'documents.autosave'),
    ).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(
      pageApi.request.mock.calls.filter(([input]) => input.operation === 'documents.autosave'),
    ).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(
      pageApi.request.mock.calls.filter(([input]) => input.operation === 'documents.autosave'),
    ).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: /^Title\*?$/ })).toHaveValue('Autosaved title');
  } finally {
    vi.useRealTimers();
  }
});

it('cancels publication scheduling by keyboard, restores trigger focus and sends no publication request', async () => {
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  const trigger = await screen.findByRole('button', { name: 'More actions' });
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Schedule publication' }));
  const dialog = await screen.findByRole('dialog', { name: 'Schedule publication' });
  expect(within(dialog).getByRole('button', { name: 'Schedule publication' })).toBeDisabled();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(
    pageApi.request.mock.calls.some(([input]) => input.operation === 'content.schedulePublication'),
  ).toBe(false);
  expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it('moves a document with the selected real folder and current revision through a manual save', async () => {
  let current = record();
  const folder = {
    id: oldVersion,
    name: 'Editorial folder',
    parentId: null,
    version: 1,
    createdAt: date,
    updatedAt: date,
    children: [],
  };
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'folders.list') return Promise.resolve(ok({ rows: [folder] }));
    if (input.operation === 'documents.update') {
      current = record({ revision: 4, versionId: oldVersion, folderId: folder.id });
      return Promise.resolve(ok(current));
    }
    if (input.operation === 'documents.get') return Promise.resolve(ok(current));
    if (input.operation === 'collections.editor') return Promise.resolve(ok(descriptor(current)));
    return defaultPageRequest(input);
  });
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  await screen.findByRole('textbox', { name: /^Title\*?$/ });
  fireEvent.change(screen.getByRole('combobox', { name: 'Folder' }), {
    target: { value: folder.id },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved', { exact: true });
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'documents.update')?.[0].body,
  ).toEqual({ revision: 3, locale: 'en', folderId: folder.id });
  expect(screen.getByRole('combobox', { name: 'Folder' })).toHaveValue(folder.id);
});
