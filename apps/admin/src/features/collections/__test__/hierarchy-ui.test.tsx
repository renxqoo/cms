import {
  pageApi,
  resetPageApi,
  ok,
  defaultPageRequest,
  collection,
  record,
  recordId,
  secondId,
  descriptor,
} from './page-fixture';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { failure } from '../../../api/result';
import type { Collection } from '../../../contracts/content';
import type { EditorNode } from '../../../contracts/editor';
import { HierarchyTree } from '../hierarchy-tree';
import { HierarchyMoveDialog } from '../hierarchy-move-dialog';
import { DocumentEditorPage } from '../editor-page';

const parentId = '55555555-5555-4555-8555-555555555555';
const parentNode: EditorNode = {
  id: 'parent',
  name: 'parent',
  path: 'parent',
  label: 'Parent',
  type: 'relationship',
  required: false,
  localized: false,
  write: 'allowed',
  constraints: { relationTo: ['articles'], hasMany: false },
};
const configured: Collection = {
  ...collection,
  admin: { useAsTitle: 'title' },
  hierarchy: {
    kind: 'tags',
    parentFieldName: 'parent',
    slugPathFieldName: 'slugPath',
    titlePathFieldName: 'titlePath',
    allowHasMany: true,
    treeLimit: 1,
    useHeaderButton: true,
    injectSidebarTab: true,
    relatedCollections: [],
  },
};
const parent = record({ id: parentId, data: { title: 'Parent destination' } });
beforeEach(() => {
  resetPageApi();
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'collections.get') return Promise.resolve(ok(configured));
    if (input.operation === 'collections.list') return Promise.resolve(ok({ rows: [configured] }));
    if (input.operation === 'collections.editor')
      return Promise.resolve(
        ok(descriptor(record(), { layout: [...descriptor().layout, parentNode] })),
      );
    if (input.operation === 'documents.list')
      return Promise.resolve(ok({ rows: [parent], total: 1, page: 1, pageSize: 20 }));
    if (input.operation === 'hierarchy.move') return Promise.resolve(ok({ rows: [record()] }));
    if (input.operation === 'hierarchy.tree') {
      const rows = input.query?.parentId
        ? [record({ id: secondId, data: { title: 'Child' } })]
        : input.query?.page === 2
          ? [parent]
          : [record()];
      return Promise.resolve(
        ok({
          parentId: input.query?.parentId ?? null,
          rows,
          total: input.query?.parentId ? 1 : 2,
          page: input.query?.page ?? 1,
          pageSize: 1,
        }),
      );
    }
    return defaultPageRequest(input);
  });
});
afterEach(() => vi.resetAllMocks());

it('browses paged branches with keyboard controls, opens documents and cancels collapsed requests', async () => {
  renderManagement(
    <HierarchyTree
      collection={configured}
      locale="en"
      mode="editing"
      selected={[]}
      onChanged={vi.fn<() => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Browse hierarchy' }));
  await screen.findByRole('button', { name: 'Story' });
  const expand = screen.getByRole('button', { name: 'Expand children: Story' });
  expand.focus();
  await userEvent.keyboard('{Enter}');
  await screen.findByRole('button', { name: 'Child' });
  const childRequest = pageApi.request.mock.calls.find(
    ([input]) => input.operation === 'hierarchy.tree' && input.query?.parentId === recordId,
  )?.[0];
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByRole('button', { name: 'Parent destination' });
  expect(childRequest?.signal.aborted).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Parent destination' }));
  expect(pageApi.push).toHaveBeenCalledWith(
    `/dashboard/collections/articles/${parentId}?locale=en`,
    undefined,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  await screen.findByRole('button', { name: 'Story' });
  await userEvent.click(screen.getByRole('button', { name: 'Collapse children: Story' }));
  expect(screen.queryByRole('button', { name: 'Child' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Hide hierarchy' }));
  expect(screen.queryByRole('button', { name: 'Story' })).not.toBeInTheDocument();
});

it('selects a searchable parent and moves the original selected revisions in one idempotent request', async () => {
  const changed = vi.fn<() => void>();
  renderManagement(
    <HierarchyTree
      collection={configured}
      locale="en"
      mode="editing"
      selected={[record()]}
      onChanged={changed}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Move selected items' }));
  const dialog = screen.getByRole('dialog', { name: 'Move selected items' });
  await within(dialog).findByRole('button', { name: 'Choose existing content' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Choose existing content' }));
  await userEvent.click(
    await screen.findByRole('option', { name: 'Articles: Parent destination' }),
  );
  await userEvent.keyboard('{Escape}');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Move items' }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'hierarchy.move')?.[0],
  ).toMatchObject({
    body: { locale: 'en', parentId, items: [{ id: recordId, revision: 3 }] },
  });
  expect(screen.queryByRole('dialog', { name: 'Move selected items' })).not.toBeInTheDocument();
});

it('keeps uncertain moves locked and retries exactly the same intent while allowing an explicit root destination', async () => {
  const original = pageApi.request.getMockImplementation();
  let first = true;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'hierarchy.move' && first) {
      first = false;
      return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
    }
    if (!original) throw new Error('Missing request fixture');
    return original(input);
  });
  const close = vi.fn<() => void>();
  renderManagement(
    <HierarchyMoveDialog
      collection={configured}
      locale="en"
      documents={[record()]}
      onClose={close}
      onChanged={vi.fn<() => void>()}
    />,
  );
  await screen.findByRole('button', { name: 'Choose existing content' });
  await userEvent.click(screen.getByRole('button', { name: 'Use root level' }));
  await userEvent.click(screen.getByRole('button', { name: 'Move items' }));
  await screen.findByRole('button', { name: 'Retry the same move' });
  expect(screen.getByRole('button', { name: 'Use root level' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Retry the same move' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  const calls = pageApi.request.mock.calls
    .filter(([input]) => input.operation === 'hierarchy.move')
    .map(([input]) => ({ body: input.body, key: input.idempotencyKey }));
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[0]?.body).toMatchObject({ parentId: null });
});

it('requires reloading after a revision conflict and exposes server errors without closing the move', async () => {
  const original = pageApi.request.getMockImplementation();
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'hierarchy.move')
      return Promise.resolve(failure('version_conflict', 409));
    if (!original) throw new Error('Missing request fixture');
    return original(input);
  });
  const changed = vi.fn<() => void>();
  const close = vi.fn<() => void>();
  renderManagement(
    <HierarchyMoveDialog
      collection={configured}
      locale="en"
      documents={[record()]}
      onClose={close}
      onChanged={changed}
    />,
  );
  await screen.findByRole('button', { name: 'Choose existing content' });
  await userEvent.click(screen.getByRole('button', { name: 'Move items' }));
  expect(close).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole('button', { name: 'Reload current documents' }));
  expect(close).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalledOnce();
});

it('retries failed branches and shows empty children without granting move controls to published readers', async () => {
  let failed = true;
  pageApi.request.mockImplementation((input) => {
    if (failed) {
      failed = false;
      return Promise.resolve(failure('temporarily_unavailable', 503));
    }
    return Promise.resolve(
      ok({
        parentId: input.query?.parentId ?? null,
        rows: input.query?.parentId ? [] : [record()],
        total: input.query?.parentId ? 0 : 1,
        page: 1,
        pageSize: 1,
      }),
    );
  });
  renderManagement(
    <HierarchyTree
      collection={configured}
      locale="en"
      mode="published"
      selected={[record()]}
      onChanged={vi.fn<() => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Browse hierarchy' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await screen.findByRole('button', { name: 'Story' });
  expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Expand children: Story' }));
  expect(await screen.findByText('No items at this level')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Story' }));
  expect(pageApi.push).toHaveBeenCalledWith(
    `/dashboard/collections/articles/${recordId}?locale=en&mode=published`,
    undefined,
  );
});

it('hides hierarchy without configuration or permission', () => {
  pageApi.denied.add('hierarchy.tree');
  renderManagement(
    <HierarchyTree
      collection={configured}
      locale="en"
      mode="editing"
      selected={[]}
      onChanged={vi.fn<() => void>()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Browse hierarchy' })).not.toBeInTheDocument();
  expect(pageApi.request).not.toHaveBeenCalled();
});

it('edits the parent in the document header and saves it through the normal draft channel', async () => {
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  await screen.findByRole('textbox', { name: /^Title/ });
  expect(screen.queryByRole('group', { name: 'Parent' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Choose parent' }));
  const dialog = screen.getByRole('dialog', { name: 'Choose parent' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Choose existing content' }));
  await userEvent.click(
    await screen.findByRole('option', { name: 'Articles: Parent destination' }),
  );
  await userEvent.keyboard('{Escape}');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls.some(([input]) => input.operation === 'documents.update'),
    ).toBe(true),
  );
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'documents.update')?.[0].body,
  ).toMatchObject({ data: { parent: { collection: 'articles', id: parentId } } });
});
