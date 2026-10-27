import {
  pageApi,
  resetPageApi,
  collection,
  descriptor,
  record,
  recordId,
  ok,
} from './page-fixture';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { CopyDocumentDialog } from '../copy-document-dialog';
import type { EditorNode } from '../../../contracts/editor';
import type { ApiResult } from '../../../api/result';
import type { PageRequest } from './page-fixture';

const nodes: EditorNode[] = [
  {
    id: 'title',
    name: 'title',
    type: 'text',
    label: 'Title',
    required: false,
    localized: true,
    write: 'allowed',
    constraints: {},
  },
  {
    id: 'related',
    name: 'related',
    type: 'relationship',
    label: 'Related',
    required: false,
    localized: true,
    write: 'allowed',
    constraints: { relationTo: ['articles'], filterOptions: true },
  },
];
beforeEach(resetPageApi);

it('uses each copy locale and copy-only permission, cancels sibling and locale searches, and ignores late results', async () => {
  const snapshot = {
    collection,
    editor: descriptor(record(), { intent: 'read', layout: nodes }),
    document: record(),
  };
  const requests: { input: PageRequest; resolve: (value: ApiResult<unknown>) => void }[] = [];
  pageApi.denied.add('documents.update');
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'collections.fieldOptions')
      return new Promise((resolve) => {
        requests.push({ input, resolve });
      });
    const locale = input.query?.locale === 'zh-CN' ? 'zh-CN' : 'en';
    const document = record({ data: { title: `Copy ${locale}`, related: null } });
    return Promise.resolve(
      ok(
        input.operation === 'collections.editor'
          ? descriptor(document, { intent: 'copy', locale, layout: nodes })
          : document,
      ),
    );
  });
  const view = renderManagement(
    <CopyDocumentDialog
      snapshot={snapshot}
      collections={[collection]}
      busy={false}
      failure={null}
      onClose={vi.fn<() => void>()}
      onCopy={vi.fn<() => Promise<boolean>>().mockResolvedValue(true)}
    />,
  );
  const title = await screen.findByRole('textbox', { name: /^Title/ });
  const locale = screen.getByRole('combobox', { name: 'Copy language' });
  fireEvent.click(screen.getByRole('button', { name: 'Choose existing content' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]?.input.body).toMatchObject({
    candidate: {
      intent: 'copy',
      id: recordId,
      revision: 3,
      locale: 'en',
      data: { title: 'Copy en', related: null },
    },
  });
  fireEvent.change(title, { target: { value: 'Edited copy' } });
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[0]?.input.signal.aborted).toBe(true);
  expect(requests[1]?.input.body).toMatchObject({
    candidate: { intent: 'copy', locale: 'en', data: { title: 'Edited copy' } },
  });
  fireEvent.change(locale, { target: { value: 'zh-CN' } });
  await waitFor(() => expect(requests[1]?.input.signal.aborted).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Choose existing content' }));
  await waitFor(() => expect(requests).toHaveLength(3));
  expect(requests[2]?.input.body).toMatchObject({
    candidate: {
      intent: 'copy',
      id: recordId,
      revision: 3,
      locale: 'zh-CN',
      data: { title: 'Copy zh-CN', related: null },
    },
  });
  await act(async () => {
    requests[0]?.resolve(
      ok({ rows: [record({ data: { title: 'Stale source' } })], total: 1, page: 1, pageSize: 20 }),
    );
    requests[1]?.resolve(
      ok({ rows: [record({ data: { title: 'Stale copy' } })], total: 1, page: 1, pageSize: 20 }),
    );
    requests[2]?.resolve(
      ok({
        rows: [record({ data: { title: 'Chinese option' } })],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    );
    await Promise.resolve();
  });
  expect(await screen.findByRole('option', { name: 'Articles: Chinese option' })).toBeVisible();
  expect(screen.queryByRole('option', { name: /Stale/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search content' }), {
    target: { value: 'next' },
  });
  await waitFor(() => expect(requests).toHaveLength(4));
  view.unmount();
  expect(requests[3]?.input.signal.aborted).toBe(true);
});
