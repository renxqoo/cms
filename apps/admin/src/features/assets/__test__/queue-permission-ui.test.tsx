import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AssetUploadQueue } from '../asset-upload-queue';
import { uploadServices } from '../upload-requests';
import { Harness, json, requestUrl, resetUi, ui } from '../../../../test/support/admin-asset-ui';
import {
  budget,
  deferred,
  file,
  first,
  manifest,
  ok,
  second,
  session,
} from '../../../../test/support/admin-asset-data';

vi.mock('../../access-control/provider', async () => {
  const support = await import('../../../../test/support/admin-asset-ui');
  return { useAccessControl: support.access };
});
vi.mock('../../../components/shell/navigation/provider', async () => {
  const { ui: state } = await import('../../../../test/support/admin-asset-ui');
  return {
    useAppNavigation: () => ({ adapter: state.adapter, push: state.push, replace: state.replace }),
  };
});
const fetcher = vi.fn<typeof fetch>();
let creates = 0;
let ready = false;
let pending: ReturnType<typeof deferred<Response>> | null = null;
function api(input: Parameters<typeof fetch>[0]) {
  const path = new URL(requestUrl(input), 'http://localhost').pathname;
  const id = path.includes(second) ? second : first;
  if (path.endsWith('/uploads')) {
    creates += 1;
    return Promise.resolve(json(session({ id: creates === 1 ? first : second }), 201));
  }
  if (path.endsWith('/completions'))
    return (
      (id === first ? pending?.promise : null) ??
      Promise.resolve(json(session({ id, status: 'processing' }), 202))
    );
  if (path.includes('/uploads/'))
    return Promise.resolve(
      json(
        session({ id, status: ready ? 'ready' : 'processing', manifest: ready ? manifest : null }),
      ),
    );
  throw new Error(`Unexpected upload request: ${path}`);
}
function subject(disabled = false) {
  return (
    <Harness>
      <AssetUploadQueue collection="images" budget={budget} purpose="create" disabled={disabled} />
    </Harness>
  );
}
beforeEach(() => {
  resetUi();
  creates = 0;
  ready = false;
  pending = null;
  fetcher.mockReset().mockImplementation(api);
  vi.stubGlobal('fetch', fetcher);
  vi.spyOn(uploadServices, 'write').mockImplementation(({ session: current }) =>
    Promise.resolve(ok({ uploadId: current.id, bytes: 4, digest: 'digest' })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('disabled metadata prevents the next queued file from creating a session after an accepted completion settles', async () => {
  pending = deferred<Response>();
  const view = render(subject());
  fireEvent.change(screen.getByLabelText('Choose files'), {
    target: { files: [file('one.png'), file('two.png'), file('three.png')] },
  });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([input]) => requestUrl(input).endsWith('/completions')),
    ).toHaveLength(2),
  );
  view.rerender(subject(true));
  expect(screen.getByLabelText('Choose files')).toBeDisabled();
  await act(async () => {
    pending?.finish(json(session({ status: 'ready', manifest }), 202));
    await Promise.resolve();
  });
  expect(creates).toBe(2);
  expect(screen.getByText('three.png')).toBeVisible();
  expect(screen.getByText('Queued')).toBeVisible();
});
it('continues reading already accepted upload processing after only a write permission is revoked', async () => {
  vi.useFakeTimers();
  const view = render(subject());
  fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [file()] } });
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(
    fetcher.mock.calls.filter(([input]) => requestUrl(input).endsWith(`/uploads/${first}`)),
  ).toHaveLength(1);
  ui.denied.add('assets.writeUpload');
  view.rerender(subject());
  expect(screen.getByLabelText('Choose files')).toBeDisabled();
  ready = true;
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(
    screen.getByText('The file is processed and ready. It has not been attached to a document.'),
  ).toBeVisible();
  expect(creates).toBe(1);
  expect(
    fetcher.mock.calls.filter(([input]) => requestUrl(input).endsWith('/completions')),
  ).toHaveLength(1);
});
