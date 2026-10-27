import { pageApi, resetPageApi, defaultPageRequest, ok } from './page-fixture';
import { useState } from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  renderManagement,
  ManagementTestProvider,
} from '../../../../../../test/support/admin-management';

import type { PageRequest } from './page-fixture';
import {
  presetCollection,
  presetPreview,
  previewInput,
  builtinConstraints,
  parameter,
} from './preset-ui-support';
import { PresetAccessEditor, privatePresetAccess } from '../preset-access-editor';
import { QueryPresetManager } from '../query-presets';
import { parseDocumentQuery } from '../query';
import type { PresetAccess } from '../../../contracts/query-presets';
import type { PresetValidity } from '../preset-candidate';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
const actor = '11111111-1111-4111-8111-111111111111';
function Harness({
  locale = 'en',
  source,
}: {
  locale?: string;
  source?: { id: string; version: number };
}) {
  const [access, setAccess] = useState<PresetAccess>({
    ...privatePresetAccess(actor),
    read: { constraint: 'team' },
  });
  const [validity, setValidity] = useState<PresetValidity | null>(null);
  return (
    <>
      <PresetAccessEditor
        value={access}
        context={{
          collection: presetCollection,
          name: 'Team',
          query: { q: '', columns: [], sort: [] },
          locale,
          ...(source ? { source } : {}),
        }}
        change={setAccess}
        validity={setValidity}
        readOnly={false}
      />
      <output aria-label="Rules">{JSON.stringify(access)}</output>
      <output aria-label="Validity">{String(validity?.valid === true)}</output>
    </>
  );
}
beforeEach(() => {
  resetPageApi();
  pageApi.request.mockImplementation((input) =>
    input.operation === 'queryPresets.preview'
      ? Promise.resolve(presetPreview(input))
      : defaultPageRequest(input),
  );
});
afterEach(() => vi.restoreAllMocks());
it('renders actual custom fields, retains the signed default once, and keeps invalid JSON drafts unsavable', async () => {
  renderManagement(<Harness />);
  await waitFor(() => expect(screen.getByLabelText('Validity')).toHaveTextContent('true'));
  expect(screen.getByLabelText('Note')).toHaveValue('Default');
  expect(screen.queryByLabelText(/Custom settings/)).toBeNull();
  expect(screen.getByLabelText('Rules')).toHaveTextContent('signed-defaults');
  const before = pageApi.request.mock.calls.filter(
    ([input]) => input.operation === 'queryPresets.preview',
  ).length;
  fireEvent.change(screen.getByLabelText('Metadata'), { target: { value: '{broken' } });
  expect(screen.getByLabelText('Metadata')).toHaveValue('{broken');
  expect(screen.getByLabelText('Validity')).toHaveTextContent('false');
  expect(screen.getByLabelText('Rules')).toHaveTextContent('"ok":true');
  expect(
    pageApi.request.mock.calls.filter(([input]) => input.operation === 'queryPresets.preview'),
  ).toHaveLength(before);
  fireEvent.change(screen.getByLabelText('Metadata'), { target: { value: '{"ok":false}' } });
  await waitFor(() => expect(screen.getByLabelText('Validity')).toHaveTextContent('true'));
  expect(screen.getByLabelText('Rules')).toHaveTextContent('"ok":false');
});
it('keeps the field DOM while pending, cancels changed locales and ignores the old response', async () => {
  const view = renderManagement(<Harness />);
  await waitFor(() => expect(screen.getByLabelText('Validity')).toHaveTextContent('true'));
  let release: ((value: ApiResult<unknown>) => void) | undefined;
  let stale: PageRequest | undefined;
  pageApi.request.mockImplementation((input) => {
    if (input.operation !== 'queryPresets.preview') return defaultPageRequest(input);
    const body = previewInput.parse(input.body);
    if (
      body.action === 'read' &&
      body.locale === 'en' &&
      body.access.read.data?.['Note'] === 'Typed'
    ) {
      stale = input;
      return new Promise((resolve) => {
        release = resolve;
      });
    }
    return Promise.resolve(presetPreview(input));
  });
  const input = screen.getByLabelText('Note');
  fireEvent.change(input, { target: { value: 'Typed' } });
  await waitFor(() => expect(stale).toBeDefined());
  expect(screen.getByLabelText('Note')).toBe(input);
  expect(input).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Validity')).toHaveTextContent('false');
  view.rerender(
    <ManagementTestProvider>
      <Harness locale="zh-CN" />
    </ManagementTestProvider>,
  );
  await waitFor(() => expect(stale?.signal?.aborted).toBe(true));
  await act(async () => {
    if (!stale) throw new Error('Missing stale request');
    release?.(presetPreview(stale, { data: { Note: 'Stale' } }));
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.getByLabelText('Validity')).toHaveTextContent('true'));
  expect(screen.getByLabelText('Rules')).not.toHaveTextContent('Stale');
  expect(screen.getByLabelText('Note')).toHaveValue('Typed');
  view.unmount();
});
it('uses server-filtered builtin choices and rejects mismatched component versions instead of enabling save', async () => {
  pageApi.request.mockImplementation((input) =>
    input.operation === 'queryPresets.preview'
      ? Promise.resolve(
          presetPreview(input, {
            constraints: builtinConstraints.filter((option) => option.value !== 'everyone'),
            componentVersions: { 'missing/custom': '2' },
            layout: [parameter('Note', { components: { Field: 'missing/custom' } })],
          }),
        )
      : defaultPageRequest(input),
  );
  renderManagement(<Harness />);
  await screen.findAllByText('Custom settings are unavailable to your role.');
  const read = screen.getByRole('region', { name: 'Read view' });
  expect(
    within(read).queryByRole('option', { name: 'Everyone with collection access' }),
  ).toBeNull();
  expect(screen.getByLabelText('Validity')).toHaveTextContent('false');
});
it('cancels custom preview when the saved-views dialog closes and does not apply a late default', async () => {
  let release: ((value: ApiResult<unknown>) => void) | undefined;
  let pending: PageRequest | undefined;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'queryPresets.list')
      return Promise.resolve(ok({ rows: [], total: 0, page: 1, pageSize: 20 }));
    if (input.operation === 'queryPresets.preview') {
      if (previewInput.parse(input.body).access.read.constraint === 'team') {
        pending = input;
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      return Promise.resolve(presetPreview(input));
    }
    return defaultPageRequest(input);
  });
  renderManagement(
    <QueryPresetManager
      collection={presetCollection}
      query={parseDocumentQuery(new URLSearchParams(), presetCollection)}
      columns={[]}
      onApply={vi.fn<(...values: unknown[]) => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Saved views' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Read view' }), {
    target: { value: 'team' },
  });
  await waitFor(() => expect(pending).toBeDefined());
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(pending?.signal?.aborted).toBe(true));
  await act(async () => {
    release?.(failure('forbidden', 403));
    await Promise.resolve();
  });
  expect(pageApi.report).not.toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
});
it('does not load custom preview when its endpoint permission is revoked', async () => {
  pageApi.denied.add('queryPresets.preview');
  renderManagement(<Harness />);
  await screen.findAllByText('Custom settings are unavailable to your role.');
  expect(
    pageApi.request.mock.calls.some(([input]) => input.operation === 'queryPresets.preview'),
  ).toBe(false);
  expect(screen.getByLabelText('Validity')).toHaveTextContent('false');
});

it('retains edited fields through a real preview failure and retries the same candidate without clearing the draft', async () => {
  renderManagement(<Harness />);
  await waitFor(() => expect(screen.getByLabelText('Validity')).toHaveTextContent('true'));
  let unavailable = true;
  pageApi.request.mockImplementation((request) => {
    if (request.operation !== 'queryPresets.preview') return defaultPageRequest(request);
    if (previewInput.parse(request.body).action === 'read' && unavailable)
      return Promise.resolve(failure('temporarily_unavailable', 503));
    return Promise.resolve(presetPreview(request));
  });
  const input = screen.getByLabelText('Note');
  fireEvent.change(input, { target: { value: 'Retained' } });
  const retry = await screen.findByRole('button', { name: 'Try again' });
  expect(input).toHaveValue('Retained');
  expect(input).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Validity')).toHaveTextContent('false');
  unavailable = false;
  await userEvent.click(retry);
  await waitFor(() => expect(screen.getByLabelText('Validity')).toHaveTextContent('true'));
  expect(screen.getByLabelText('Note')).toBe(input);
  expect(input).toHaveValue('Retained');
});
