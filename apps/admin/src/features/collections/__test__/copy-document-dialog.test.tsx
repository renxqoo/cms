import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { pageApi, resetPageApi, record, descriptor, collection, ok } from './page-fixture';
import {
  renderManagement,
  ManagementTestProvider,
} from '../../../../../../test/support/admin-management';
import type { PageRequest } from './page-fixture';
import type { EditorNode } from '../../../contracts/editor';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { CopyDocumentDialog } from '../copy-document-dialog';

type Props = ComponentProps<typeof CopyDocumentDialog>;
const layout: EditorNode[] = [
  {
    id: 'slug',
    type: 'text',
    name: 'slug',
    label: 'Slug',
    required: true,
    localized: true,
    write: 'allowed',
    constraints: {},
  },
  {
    id: 'metadata',
    type: 'json',
    name: 'metadata',
    label: 'Metadata',
    required: false,
    localized: true,
    write: 'allowed',
    constraints: {},
  },
  {
    id: 'denied',
    type: 'text',
    name: 'denied',
    label: 'Read only',
    required: false,
    localized: true,
    write: 'denied',
    constraints: {},
  },
];
function copyRequest(input: PageRequest): Promise<ApiResult<unknown>> {
  const locale = input.query?.locale === 'zh-CN' ? 'zh-CN' : 'en';
  const document = record({
    data: {
      slug: locale === 'en' ? 'source-en' : 'source-zh',
      metadata: { ready: true },
      denied: 'protected',
    },
  });
  return Promise.resolve(
    input.operation === 'collections.editor'
      ? ok(descriptor(document, { intent: 'copy', locale, layout }))
      : ok(document),
  );
}
function props(overrides: Partial<Props> = {}): Props {
  return {
    snapshot: { collection, editor: descriptor(), document: record() },
    services: {
      collections: [],
      searchReferences: () => Promise.resolve({ rows: [], total: 0, page: 1, pageSize: 20 }),
    },
    busy: false,
    failure: null,
    onClose: vi.fn<() => void>(),
    onCopy: vi.fn<Props['onCopy']>().mockResolvedValue(true),
    ...overrides,
  };
}
beforeEach(() => {
  resetPageApi();
  pageApi.request.mockImplementation(copyRequest);
});
afterEach(() => vi.resetAllMocks());

it('copies both translated unique fields with locale-specific writable patches and no fallback data', async () => {
  const input = props();
  renderManagement(<CopyDocumentDialog {...input} />);
  const slug = await screen.findByRole('textbox', { name: /^Slug/ });
  expect(slug).toHaveValue('source-en');
  fireEvent.change(slug, { target: { value: 'copy-en' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Copy language' }), {
    target: { value: 'zh-CN' },
  });
  const chinese = screen.getByRole('textbox', { name: /^Slug/ });
  expect(chinese).toHaveValue('source-zh');
  fireEvent.change(chinese, { target: { value: 'copy-zh' } });
  await userEvent.click(screen.getByRole('button', { name: 'Copy document' }));
  await waitFor(() => expect(input.onClose).toHaveBeenCalledTimes(1));
  expect(input.onCopy).toHaveBeenCalledWith({
    en: { slug: 'copy-en' },
    'zh-CN': { slug: 'copy-zh' },
  });
  const requests = pageApi.request.mock.calls.map(([request]) => request);
  expect(
    requests
      .filter((request) => request.operation === 'collections.editor')
      .map((request) => request.query),
  ).toEqual(
    expect.arrayContaining([
      { intent: 'copy', id: record().id, locale: 'en', mode: 'editing' },
      { intent: 'copy', id: record().id, locale: 'zh-CN', mode: 'editing' },
    ]),
  );
  for (const request of requests.filter((entry) => entry.operation === 'documents.get'))
    expect(request.query).toEqual({
      locale: request.query?.locale,
      fallback: [],
      depth: 0,
      mode: 'editing',
    });
});

it('regression: switching copy languages preserves invalid JSON text and keeps all copy writes disabled', async () => {
  const input = props();
  renderManagement(<CopyDocumentDialog {...input} />);
  await screen.findByRole('textbox', { name: 'Metadata' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Metadata' }), { target: { value: '{' } });
  expect(screen.getByRole('button', { name: 'Copy document' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Copy language' }), {
    target: { value: 'zh-CN' },
  });
  expect(screen.getByRole('textbox', { name: 'Metadata' })).toHaveValue(
    JSON.stringify({ ready: true }, null, 2),
  );
  expect(screen.getByRole('button', { name: 'Copy document' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Copy language' }), {
    target: { value: 'en' },
  });
  expect(screen.getByRole('textbox', { name: 'Metadata' })).toHaveValue('{');
  fireEvent.change(screen.getByRole('textbox', { name: 'Metadata' }), {
    target: { value: '{"ready":false}' },
  });
  expect(screen.getByRole('button', { name: 'Copy document' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Copy document' }));
  expect(input.onCopy).toHaveBeenCalledWith({ en: { metadata: { ready: false } }, 'zh-CN': {} });
});

it.each(['metadata', 'document'] as const)(
  'refuses copy when the %s revision no longer matches the source',
  async (changed) => {
    pageApi.request.mockImplementation(async (input) => {
      const response = await copyRequest(input);
      if (changed === 'metadata' && input.operation === 'collections.editor')
        return ok(descriptor(record({ revision: 9 }), { intent: 'copy', locale: 'en', layout }));
      if (changed === 'document' && input.operation === 'documents.get')
        return ok(record({ revision: 9 }));
      return response;
    });
    const input = props();
    renderManagement(<CopyDocumentDialog {...input} />);
    await waitFor(() =>
      expect(pageApi.report).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, status: 409 }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Copy document' })).toBeDisabled();
    expect(input.onCopy).not.toHaveBeenCalled();
  },
);

it('does not read or submit when copy permission is absent and responds safely to a changed source', async () => {
  pageApi.denied.add('documents.copy');
  const input = props();
  const view = renderManagement(<CopyDocumentDialog {...input} />);
  expect(screen.getByRole('button', { name: 'Copy document' })).toBeDisabled();
  expect(pageApi.request).not.toHaveBeenCalled();
  view.unmount();
  pageApi.denied.clear();
  const active = renderManagement(<CopyDocumentDialog {...input} />);
  await screen.findByRole('textbox', { name: /^Slug/ });
  active.rerender(
    <ManagementTestProvider>
      <CopyDocumentDialog
        {...input}
        snapshot={{
          ...input.snapshot,
          document: record({ versionId: '99999999-9999-4999-8999-999999999999' }),
        }}
      />
    </ManagementTestProvider>,
  );
  expect(screen.getByRole('button', { name: 'Copy document' })).toBeDisabled();
  expect(
    screen.getByText(
      'The source or copy permissions changed. Close this dialog and reload the document.',
    ),
  ).toBeInTheDocument();
});

it('keeps the copy draft after a failed write and offers the same locked intent after an unknown response', async () => {
  const input = props({ onCopy: vi.fn<Props['onCopy']>().mockResolvedValue(false) });
  const view = renderManagement(<CopyDocumentDialog {...input} />);
  const slug = await screen.findByRole('textbox', { name: /^Slug/ });
  fireEvent.change(slug, { target: { value: 'kept-copy' } });
  await userEvent.click(screen.getByRole('button', { name: 'Copy document' }));
  await waitFor(() => expect(input.onCopy).toHaveBeenCalledTimes(1));
  expect(input.onClose).not.toHaveBeenCalled();
  expect(slug).toHaveValue('kept-copy');
  view.rerender(
    <ManagementTestProvider>
      <CopyDocumentDialog {...input} failure={failure('request_failed', 0, { uncertain: true })} />
    </ManagementTestProvider>,
  );
  expect(slug).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Verify the same copy request' }));
  await waitFor(() => expect(input.onCopy).toHaveBeenCalledTimes(2));
  expect(input.onCopy).toHaveBeenLastCalledWith({ en: { slug: 'kept-copy' }, 'zh-CN': {} });
});

it('reports failed reads, permits an explicit reload and cancels pending reads on unmount', async () => {
  pageApi.request.mockResolvedValueOnce(failure('temporarily_unavailable', 503));
  const input = props();
  const view = renderManagement(<CopyDocumentDialog {...input} />);
  await waitFor(() =>
    expect(pageApi.report).toHaveBeenCalledWith(expect.objectContaining({ status: 503 })),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('textbox', { name: /^Slug/ });
  view.unmount();
  let finish: ((value: ApiResult<unknown>) => void) | undefined;
  pageApi.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = renderManagement(<CopyDocumentDialog {...input} />);
  const signal = pageApi.request.mock.calls.at(-1)?.[0].signal;
  pending.unmount();
  expect(signal?.aborted).toBe(true);
  finish?.(failure('request_cancelled', 0));
});

it('uses Chinese labels and blocks submission until all required source reads complete', () => {
  let finish: ((value: ApiResult<unknown>) => void) | undefined;
  pageApi.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const input = props();
  const view = renderManagement(<CopyDocumentDialog {...input} />, 'zh');
  expect(screen.getByRole('button', { name: '复制文档' })).toBeDisabled();
  expect(screen.getByText('正在读取复制字段…')).toBeInTheDocument();
  view.unmount();
  finish?.(failure('request_cancelled', 0));
});
