import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { UploadQueue } from '../upload-queue';
import { editor, session, manifest, success } from './support';

interface Request {
  operation: string;
  body?: unknown;
  signal: AbortSignal;
}
const mocks = vi.hoisted(() => ({
  request: vi.fn<(value: Request) => Promise<ApiResult<unknown>>>(),
  can: vi.fn<(operation: string) => boolean>(),
  report: vi.fn<(...values: unknown[]) => void>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: mocks.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({ phase: 'ready', can: mocks.can, reportResult: mocks.report }),
}));
vi.mock('../../../components/shell/shell-provider', () => ({ useShell: () => 'en' }));
beforeEach(() => {
  mocks.can.mockReturnValue(true);
});
afterEach(() => vi.resetAllMocks());

it('regression: remains usable after StrictMode replays its cleanup before the first selected file', async () => {
  if (!editor.upload) throw new Error('Upload metadata required');
  mocks.request.mockResolvedValue(success(session({ status: 'ready', manifest })));
  const ready = vi.fn<(...values: unknown[]) => void>();
  render(
    <StrictMode>
      <UploadQueue collection="media" purpose="create" limits={editor.upload} onReady={ready} />
    </StrictMode>,
  );
  fireEvent.change(screen.getByLabelText('Choose files'), {
    target: { files: [new File(['contents'], 'source.png', { type: 'image/png' })] },
  });
  expect(
    await screen.findByText('File processing completed. Save the document to attach this file.'),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Attach to document' }));
  expect(ready).toHaveBeenCalledWith(
    expect.objectContaining({ id: session().id, status: 'ready' }),
  );
});

it('requires upload and read dependencies and prevents starting with denied permissions', () => {
  if (!editor.upload) throw new Error('Upload metadata required');
  mocks.can.mockReturnValue(false);
  render(
    <UploadQueue collection="media" purpose="create" limits={editor.upload} onReady={() => {}} />,
  );
  expect(screen.getByText('Upload and result-reading permissions are required.')).toBeVisible();
  expect(screen.getByLabelText('Choose files')).toBeDisabled();
});

it('regression: refuses an upload when its eventual document consumption or result read is unavailable', () => {
  if (!editor.upload) throw new Error('Upload metadata required');
  mocks.can.mockImplementation((operation) => operation !== 'documents.create');
  render(
    <UploadQueue collection="media" purpose="create" limits={editor.upload} onReady={() => {}} />,
  );
  expect(screen.getByLabelText('Choose files')).toBeDisabled();
  expect(mocks.request).not.toHaveBeenCalled();
});

it('recovers an actual ready session, permits cancellation and keeps a ready create session outside the active byte guard', async () => {
  if (!editor.upload) throw new Error('Upload metadata required');
  mocks.request
    .mockResolvedValueOnce(success(session({ status: 'ready', manifest })))
    .mockResolvedValueOnce(success());
  const busy = vi.fn<(value: boolean) => void>();
  render(
    <UploadQueue
      collection="media"
      purpose="create"
      initialUploadId={session().id}
      limits={editor.upload}
      onReady={() => {}}
      onBusyChange={busy}
    />,
  );
  expect(await screen.findByText('source.png')).toBeVisible();
  expect(busy).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
  expect(await screen.findByText('Cancelled')).toBeVisible();
});

it('shows paused uncertain results and reuses verification instead of fabricating completion', async () => {
  if (!editor.upload) throw new Error('Upload metadata required');
  mocks.request
    .mockResolvedValueOnce(failure('request_timeout', 503, { uncertain: true }))
    .mockResolvedValueOnce(success(session({ status: 'ready', manifest })));
  render(
    <UploadQueue collection="media" purpose="create" limits={editor.upload} onReady={() => {}} />,
  );
  fireEvent.change(screen.getByLabelText('Choose files'), {
    target: { files: [new File(['contents'], 'source.png', { type: 'image/png' })] },
  });
  expect(
    await screen.findByText('Automatic waiting paused. Verify the server result to continue.'),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Verify result' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Attach to document' })).toBeVisible(),
  );
});
