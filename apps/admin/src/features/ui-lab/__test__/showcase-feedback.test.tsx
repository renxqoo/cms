import { expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderLab } from './lab-support';
import { FeedbackShowcase } from '../feedback-showcase';

it('notices can be dismissed and restored and error counts focus their actual field', () => {
  renderLab(<FeedbackShowcase />, { locale: 'en', pathname: '/ui/feedback' });
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss example notice' }));
  expect(screen.queryByText('This is a local informational notice.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show notice again' }));
  expect(screen.getByText('This is a local informational notice.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '1 field errors' }));
  expect(screen.getByRole('textbox', { name: 'Field needing attention' })).toHaveFocus();
  expect(screen.getByRole('textbox', { name: 'Field needing attention' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
});

it('progress respects both bounds, switches to indeterminate and replaces its skeleton with content', () => {
  renderLab(<FeedbackShowcase />, { locale: 'en', pathname: '/ui/feedback' });
  const increase = screen.getByRole('button', { name: 'Increase progress' });
  const decrease = screen.getByRole('button', { name: 'Decrease progress' });
  for (let step = 0; step < 6; step += 1) fireEvent.click(increase);
  expect(increase).toBeDisabled();
  expect(screen.getByRole('progressbar', { name: 'Example progress' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  for (let step = 0; step < 10; step += 1) fireEvent.click(decrease);
  expect(decrease).toBeDisabled();
  expect(screen.getByRole('progressbar', { name: 'Example progress' })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Indeterminate progress' }));
  expect(screen.getByRole('progressbar', { name: 'Example progress' })).not.toHaveAttribute(
    'aria-valuenow',
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show loading skeleton' }));
  expect(
    screen.getByText('Content is ready. Toggle the skeleton to inspect layout.'),
  ).toBeInTheDocument();
});

it('independent tasks retain loading until both finish and removable tags can be reset', () => {
  const view = renderLab(<FeedbackShowcase />, { locale: 'en', pathname: '/ui/feedback' });
  fireEvent.click(screen.getByRole('button', { name: 'Start task A' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start task B' }));
  expect(screen.getByText('Current shared tasks: 2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Finish task A' }));
  expect(screen.getByText('Current shared tasks: 1')).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Processing local tasks' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Finish task B' }));
  expect(screen.queryByRole('status', { name: 'Processing local tasks' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Featured' }));
  expect(screen.queryByRole('button', { name: 'Remove Featured' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reset tags' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove Draft' }));
  expect(screen.queryByRole('button', { name: 'Remove Draft' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Start task A' }));
  view.unmount();
});

it('the notification example publishes a chosen tone and dismisses its latest notification', async () => {
  renderLab(<FeedbackShowcase />, { locale: 'en', pathname: '/ui/feedback' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Notification style' }), {
    target: { value: 'warning' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Show local notification' }));
  expect(
    await screen.findByText('This is a local notification triggered by the current workbench.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss latest notification' }));
  await waitFor(() =>
    expect(
      screen.queryByText('This is a local notification triggered by the current workbench.'),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'Dismiss latest notification' })).toBeDisabled();
});
