import {
  pageApi,
  resetPageApi,
  collection,
  record,
  descriptor,
  recordId,
  ok,
  defaultPageRequest,
} from './page-fixture';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  renderManagement,
  ManagementTestProvider,
} from '../../../../../../test/support/admin-management';
import { referenceServices } from '../reference-services';
import { DocumentEditorPage } from '../editor-page';
import { BulkDocuments } from '../bulk-documents';
import { contentMessages } from '../messages';
import { FieldRenderer } from '../../fields/field-renderer';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import type { ReferenceQuery } from '../../fields/types';

beforeEach(resetPageApi);
afterEach(() => vi.resetAllMocks());

const rowId = '55555555-5555-4555-8555-555555555555';

function fields(revision: number) {
  const document = record({ revision });
  const services = referenceServices([collection], pageApi.report, {
    snapshot: { collection, editor: descriptor(document), document },
    data: {},
  });
  return (
    <ManagementTestProvider>
      <FieldRenderer
        idPrefix="revision-options"
        resetKey="same"
        value={{}}
        onChange={() => {}}
        onValidityChange={() => {}}
        locale="en"
        services={services}
        layout={[
          {
            id: 'related',
            name: 'related',
            label: 'Related',
            type: 'relationship',
            required: false,
            localized: false,
            write: 'allowed',
            constraints: { relationTo: ['articles'], filterOptions: true },
          },
        ]}
      />
    </ManagementTestProvider>
  );
}

it('resets the option page when a saved revision changes while the form values stay identical', async () => {
  pageApi.request
    .mockResolvedValueOnce(ok({ rows: [record()], total: 21, page: 1, pageSize: 20 }))
    .mockResolvedValueOnce(ok({ rows: [record()], total: 21, page: 2, pageSize: 20 }))
    .mockResolvedValueOnce(
      ok({
        rows: [record({ data: { title: 'Fresh revision' } })],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    );
  const view = render(fields(3));
  fireEvent.click(await screen.findByRole('button', { name: 'Choose existing content' }));
  await screen.findByRole('option', { name: 'Articles: Story' });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(pageApi.request.mock.lastCall?.[0].body).toMatchObject({ page: 2 }));
  view.rerender(fields(4));
  expect(await screen.findByRole('option', { name: 'Articles: Fresh revision' })).toBeVisible();
  expect(pageApi.request.mock.lastCall?.[0].body).toMatchObject({
    candidate: { revision: 4 },
    page: 1,
  });
});
function referenceQuery(changes: Partial<ReferenceQuery> = {}): ReferenceQuery {
  return {
    collections: ['articles'],
    collection: 'articles',
    query: 'Story',
    page: 2,
    locale: 'en',
    signal: new AbortController().signal,
    sourcePath: 'related',
    filterOptions: true,
    ...changes,
  };
}

it('uses the complete create candidate and initial snapshot for configured reference options only', async () => {
  pageApi.request.mockResolvedValue(ok({ rows: [record()], total: 1, page: 2, pageSize: 20 }));
  const snapshot = {
    collection,
    editor: descriptor(null, { initialSnapshot: 'signed.initial' }),
    document: null,
  };
  const services = referenceServices([collection], pageApi.report, {
    snapshot,
    data: { title: 'Unsaved', metadata: { count: 7 } },
  });
  const query = referenceQuery();
  expect((await services.searchReferences(query)).rows[0]?.label).toBe('Story');
  expect(pageApi.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      operation: 'collections.fieldOptions',
      params: { collection: 'articles' },
      body: {
        candidate: {
          collection: 'articles',
          locale: 'en',
          mode: 'editing',
          intent: 'create',
          initialSnapshot: 'signed.initial',
          data: { title: 'Unsaved', metadata: { count: 7 } },
        },
        path: 'related',
        relationTo: 'articles',
        q: 'Story',
        page: 2,
        pageSize: 20,
      },
      signal: query.signal,
    }),
  );
  await services.searchReferences(referenceQuery({ filterOptions: false }));
  expect(pageApi.request.mock.lastCall?.[0]).toMatchObject({
    operation: 'documents.list',
    query: { locale: 'en', fallback: [], page: 2 },
  });
});

it('does not widen configured options when the editor identity or locale is unavailable and reports server denials', async () => {
  await expect(
    referenceServices([collection], pageApi.report).searchReferences(referenceQuery()),
  ).rejects.toThrow('Invalid reference context');
  const snapshot = {
    collection,
    editor: descriptor(record(), { intent: 'read' }),
    document: record(),
  };
  await expect(
    referenceServices([collection], pageApi.report, { snapshot, data: {} }).searchReferences(
      referenceQuery(),
    ),
  ).rejects.toThrow('Invalid reference context');
  const editable = { ...snapshot, editor: descriptor() };
  const services = referenceServices([collection], pageApi.report, {
    snapshot: editable,
    data: {},
  });
  await expect(services.searchReferences(referenceQuery({ locale: 'zh-CN' }))).rejects.toThrow(
    'Invalid reference context',
  );
  await expect(services.searchReferences(referenceQuery({ sourcePath: '' }))).rejects.toThrow(
    'Invalid reference context',
  );
  await expect(
    referenceServices([collection], pageApi.report, {
      snapshot: { ...editable, editor: { ...editable.editor, mode: 'published' } },
      data: {},
    }).searchReferences(referenceQuery()),
  ).rejects.toThrow('Invalid reference context');
  for (const documents of [[], [record({ collection: 'media' })]]) {
    await expect(
      referenceServices([collection], pageApi.report, {
        collection: 'articles',
        locale: 'en',
        documents,
        data: {},
      }).searchReferences(referenceQuery()),
    ).rejects.toThrow('Invalid reference context');
  }
  await expect(
    referenceServices([collection], pageApi.report, {
      collection: 'articles',
      locale: 'zh-CN',
      documents: [record()],
      data: {},
    }).searchReferences(referenceQuery()),
  ).rejects.toThrow('Invalid reference context');
  expect(pageApi.request).not.toHaveBeenCalled();
  pageApi.request.mockResolvedValueOnce(failure('forbidden', 403));
  await expect(services.searchReferences(referenceQuery())).rejects.toThrow('forbidden');
  expect(pageApi.report).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
});

it('sends source identity separately from a polymorphic target collection', async () => {
  pageApi.request.mockResolvedValueOnce(ok({ rows: [], total: 0, page: 2, pageSize: 20 }));
  const services = referenceServices([collection], pageApi.report, {
    snapshot: { collection, editor: descriptor(), document: record() },
    data: { title: 'Draft' },
  });
  await services.searchReferences(referenceQuery({ collections: ['media'], collection: 'media' }));
  expect(pageApi.request.mock.lastCall?.[0]).toMatchObject({
    operation: 'collections.fieldOptions',
    params: { collection: 'articles' },
    body: { candidate: { collection: 'articles', id: recordId, revision: 3 }, relationTo: 'media' },
  });
});

it('requests the common bulk options for every selected document using only the current shared patch', async () => {
  const first = record({ data: { title: 'First secret' } });
  const second = record({ id: rowId, revision: 7, data: { title: 'Second secret' } });
  const nodes = [
    ...descriptor().layout.slice(0, 1),
    {
      id: 'related',
      name: 'related',
      path: 'related',
      label: 'Related',
      type: 'relationship' as const,
      required: false,
      localized: false,
      write: 'allowed' as const,
      constraints: { relationTo: ['articles'], filterOptions: true },
    },
  ];
  const requests: {
    input: Parameters<typeof pageApi.request>[0];
    resolve: (value: ApiResult<unknown>) => void;
  }[] = [];
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'collections.previewEditor')
      return Promise.resolve(ok({ behaviorHash: 'behavior', visibility: {} }));
    if (input.operation === 'collections.editor')
      return Promise.resolve(
        ok(descriptor(input.query?.id === rowId ? second : first, { layout: nodes })),
      );
    if (input.operation === 'collections.fieldOptions')
      return new Promise((resolve) => {
        requests.push({ input, resolve });
      });
    return defaultPageRequest(input);
  });
  renderManagement(
    <BulkDocuments
      collection={collection}
      documents={[first, second]}
      locale="en"
      trashed={false}
      t={contentMessages.en}
      onClose={vi.fn<() => void>()}
      onCompleted={vi.fn<() => void>()}
    />,
  );
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'update' } });
  const title = await screen.findByRole('textbox', { name: /^Title/ });
  fireEvent.click(await screen.findByRole('button', { name: 'Choose existing content' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]?.input.body).toMatchObject({
    candidate: [
      {
        collection: 'articles',
        locale: 'en',
        mode: 'editing',
        intent: 'update',
        id: recordId,
        revision: 3,
        data: {},
      },
      {
        collection: 'articles',
        locale: 'en',
        mode: 'editing',
        intent: 'update',
        id: rowId,
        revision: 7,
        data: {},
      },
    ],
    path: 'related',
    relationTo: 'articles',
    page: 1,
  });
  fireEvent.change(title, { target: { value: 'Shared replacement' } });
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[0]?.input.signal.aborted).toBe(true);
  expect(requests[1]?.input.body).toMatchObject({
    candidate: [
      { id: recordId, revision: 3, data: { title: 'Shared replacement' } },
      { id: rowId, revision: 7, data: { title: 'Shared replacement' } },
    ],
  });
  await act(async () => {
    requests[1]?.resolve(
      ok({ rows: [record({ data: { title: 'Common option' } })], total: 1, page: 1, pageSize: 20 }),
    );
    await Promise.resolve();
  });
  expect(await screen.findByRole('option', { name: 'Articles: Common option' })).toBeVisible();
});

it('cancels stale options after a sibling edit and sends stable array row identities with the current complete candidate', async () => {
  const document = record({ data: { title: 'Before', items: [{ id: rowId, related: null }] } });
  const [titleNode] = descriptor().layout;
  if (!titleNode) throw new Error('Title editor field is required');
  const editor = descriptor(document, {
    layout: [
      titleNode,
      {
        id: 'items',
        name: 'items',
        path: 'items',
        label: 'Items',
        type: 'array',
        required: false,
        localized: false,
        write: 'allowed',
        constraints: {},
        children: [
          {
            id: 'related',
            name: 'related',
            path: 'items[].related',
            label: 'Related',
            type: 'relationship',
            required: false,
            localized: false,
            write: 'allowed',
            constraints: { relationTo: ['articles'], filterOptions: true },
          },
        ],
      },
    ],
  });
  const requests: {
    input: Parameters<typeof pageApi.request>[0];
    resolve: (value: ApiResult<unknown>) => void;
  }[] = [];
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'collections.previewEditor')
      return Promise.resolve(ok({ behaviorHash: 'behavior', visibility: {} }));
    if (input.operation === 'collections.editor') return Promise.resolve(ok(editor));
    if (input.operation === 'documents.get') return Promise.resolve(ok(document));
    if (input.operation === 'collections.fieldOptions')
      return new Promise((resolve) => {
        requests.push({ input, resolve });
      });
    return defaultPageRequest(input);
  });
  const view = renderManagement(
    <DocumentEditorPage collectionKey="articles" documentId={recordId} />,
  );
  const title = await screen.findByRole('textbox', { name: /^Title\*?$/ });
  fireEvent.click(await screen.findByRole('button', { name: 'Choose existing content' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]?.input.body).toMatchObject({
    candidate: {
      collection: 'articles',
      id: recordId,
      revision: 3,
      intent: 'update',
      data: document.data,
    },
    path: `items.${rowId}.related`,
    relationTo: 'articles',
  });
  await act(async () => {
    requests[0]?.resolve(ok({ rows: [record()], total: 21, page: 1, pageSize: 20 }));
    await Promise.resolve();
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]?.input.body).toMatchObject({ page: 2 });
  fireEvent.change(title, { target: { value: 'After' } });
  await waitFor(() => expect(requests).toHaveLength(3));
  expect(requests[1]?.input.signal.aborted).toBe(true);
  expect(requests[2]?.input.body).toMatchObject({
    candidate: { data: { title: 'After', items: [{ id: rowId, related: null }] } },
    page: 1,
  });
  await act(async () => {
    requests[2]?.resolve(
      ok({ rows: [record({ data: { title: 'Current' } })], total: 1, page: 1, pageSize: 20 }),
    );
    requests[1]?.resolve(
      ok({ rows: [record({ data: { title: 'Stale' } })], total: 21, page: 2, pageSize: 20 }),
    );
    await Promise.resolve();
  });
  expect(await screen.findByRole('option', { name: 'Articles: Current' })).toBeVisible();
  expect(screen.queryByRole('option', { name: 'Articles: Stale' })).not.toBeInTheDocument();
  fireEvent.change(title, { target: { value: 'Last' } });
  await waitFor(() => expect(requests).toHaveLength(4));
  view.unmount();
  expect(requests[3]?.input.signal.aborted).toBe(true);
});
