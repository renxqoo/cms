import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Harness } from '../../../../test/support/admin-asset-ui';
import { PollingFeedback } from '../polling-feedback';
import { assetDate, workAction, workStatus } from '../work-copy';
import { assetMessages } from '../../assets/messages';

it('offers explicit continuation after the automatic waiting deadline', () => {
  const resume = vi.fn<() => void>();
  render(
    <Harness>
      <PollingFeedback paused="deadline" retryAt={null} onResume={resume} />
    </Harness>,
  );
  expect(screen.getByText(assetMessages.en.deadline)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continue checking' }));
  expect(resume).toHaveBeenCalledTimes(1);
});
it('explains hidden polling without allowing hidden continuation and includes the server retry time for rate limits', () => {
  const resume = vi.fn<() => void>();
  const view = render(
    <Harness>
      <PollingFeedback paused="hidden" retryAt={null} onResume={resume} />
    </Harness>,
  );
  expect(screen.getByText(assetMessages.en.hidden)).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  view.rerender(
    <Harness>
      <PollingFeedback paused="limited" retryAt={Date.UTC(2026, 9, 26, 2, 30)} onResume={resume} />
    </Harness>,
  );
  expect(screen.getByText(assetMessages.en.limited)).toBeVisible();
  expect(screen.getByText(/Check again after:/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continue checking' }));
  expect(resume).toHaveBeenCalledTimes(1);
});
it.each([null, 'failure'] as const)(
  'does not duplicate ordinary error feedback for %s pauses',
  (paused) => {
    const view = render(
      <Harness>
        <PollingFeedback paused={paused} retryAt={null} onResume={() => {}} />
      </Harness>,
    );
    expect(view.container).toBeEmptyDOMElement();
  },
);
it('preserves unknown server statuses and inherited object names as readable values', () => {
  expect(workStatus('failed', assetMessages.en)).toBe('Failed');
  expect(workAction('reprocess', assetMessages.zh)).toBe('图片重处理');
  expect(workStatus('custom-status', assetMessages.en)).toBe('custom-status');
  expect(workStatus('toString', assetMessages.en)).toBe('toString');
  expect(workAction('__proto__', assetMessages.zh)).toBe('__proto__');
  expect(workAction('custom-action', assetMessages.en)).toBe('custom-action');
});
it('formats dates in UTC and preserves an invalid server date instead of throwing', () => {
  expect(assetDate(null, 'en')).toBe('—');
  expect(assetDate('invalid', 'en')).toBe('invalid');
  expect(assetDate('2026-10-26T23:04:00+08:00', 'en')).toContain('3:04');
  expect(assetDate('2026-10-26T23:04:00+08:00', 'zh')).toContain('15:04');
});
