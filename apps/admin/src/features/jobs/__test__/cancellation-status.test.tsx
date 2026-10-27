import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import {
  renderManagement,
  managementSuccess,
} from '../../../../../../test/support/admin-management';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
import { WorkDetail } from '../work-detail';
import type { SelectedWork } from '../work-detail';

const api = vi.hoisted(() => ({
  request: vi.fn<(input: { operation: string }) => Promise<ApiResult<unknown>>>(),
  report: vi.fn<() => void>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({ can: () => true, reportResult: api.report }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/jobs',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn<() => void>(), replace: vi.fn<() => void>() }),
}));

const id = '11111111-1111-4111-8111-111111111111';
const target = { id, collection: 'media', status: 'ready' as const };
const time = '2026-10-26T00:00:00.000Z';
const upload = {
  ...target,
  purpose: 'create' as const,
  locale: 'en',
  filename: 'Private report.pdf',
  declaredMimeType: 'application/pdf',
  declaredBytes: 400,
  createdAt: time,
  documentId: null,
  revision: null,
  expiresAt: time,
  failureCode: null,
  jobId: null,
};
afterEach(() => vi.resetAllMocks());

it.each(['job', 'upload'] as const)(
  'regression: %s details confirm the server cancellation state after an unknown write without resending it',
  async (kind) => {
    let cancelled = false;
    const operation = kind === 'job' ? 'content.cancelPublicationSchedule' : 'assets.cancelUpload';
    const selected: SelectedWork =
      kind === 'job' ? { kind, value: target } : { kind, value: upload };
    api.request.mockImplementation((input) => {
      if (input.operation === operation) {
        cancelled = true;
        return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
      }
      const status = cancelled ? 'cancelled' : kind === 'job' ? 'queued' : 'ready';
      return Promise.resolve(
        managementSuccess(
          kind === 'upload'
            ? { ...upload, status, manifest: null }
            : {
                ...target,
                kind: 'content',
                action: 'publication',
                status,
                documentId: id,
                executeAt: time,
                createdAt: time,
                finishedAt: null,
                expectedRevision: 2,
                requestedVersionId: id,
                total: 1,
                succeeded: 0,
                failed: 0,
                items: [],
              },
        ),
      );
    });
    const close = vi.fn<() => void>();
    renderManagement(
      <WorkDetail selected={selected} onClose={close} onChanged={vi.fn<() => void>()} />,
    );
    const cancel = await screen.findByRole('button', {
      name: kind === 'job' ? 'Cancel publication schedule' : 'Cancel upload session',
    });
    await userEvent.click(cancel);
    await screen.findByText('The server confirms that this work is now cancelled.');
    expect(
      screen.queryByText(
        'The cancellation result is unconfirmed. Read the current state before trying again.',
      ),
    ).not.toBeInTheDocument();
    expect(api.request.mock.calls.filter(([input]) => input.operation === operation)).toHaveLength(
      1,
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  },
);
