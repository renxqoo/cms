import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { parseZonedDate, zonedDateInput } from '../timezone';
import { Harness, node } from './support';

it('converts selected IANA wall time to UTC, rejects a daylight-saving gap and chooses the earlier repeated instant', () => {
  expect(parseZonedDate('2026-10-27T09:15', 'Asia/Shanghai')).toEqual({
    valid: true,
    value: '2026-10-27T01:15:00.000Z',
  });
  expect(zonedDateInput('2026-10-27T01:15:00.000Z', 'Asia/Shanghai')).toBe(
    '2026-10-27T09:15:00.000',
  );
  expect(parseZonedDate('2026-03-08T02:30', 'America/New_York')).toEqual({
    valid: false,
    value: null,
  });
  expect(parseZonedDate('2026-11-01T01:30', 'America/New_York')).toEqual({
    valid: true,
    value: '2026-11-01T05:30:00.000Z',
  });
  expect(parseZonedDate('2026-02-30T12:00', 'UTC')).toEqual({ valid: false, value: null });
  expect(parseZonedDate('2026-10-27T09:15', 'Invalid/Zone')).toEqual({ valid: false, value: null });
});

it('locks a slug until the user enables manual editing and preserves the entered value when locked again', async () => {
  const user = userEvent.setup();
  render(<Harness layout={[node('slug', { type: 'slug' })]} initial={{ slug: 'original' }} />);
  expect(screen.getByRole('textbox', { name: 'slug' })).toHaveAttribute('readonly');
  await user.click(screen.getByRole('button', { name: 'Edit manually' }));
  const input = screen.getByRole('textbox', { name: 'slug' });
  expect(input).not.toHaveAttribute('readonly');
  fireEvent.change(input, { target: { value: 'manual-value' } });
  await user.click(screen.getByRole('button', { name: 'Lock slug' }));
  expect(input).toHaveAttribute('readonly');
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
    slug: 'manual-value',
  });
});

it('renders a date in its persisted timezone and changes its wall display without rewriting its UTC instant', async () => {
  const user = userEvent.setup();
  render(
    <Harness
      layout={[
        node('date', { type: 'date', constraints: { timezone: 'date_tz' } }),
        node('date_tz', { type: 'select', constraints: { options: ['UTC', 'Asia/Shanghai'] } }),
      ]}
      initial={{ date: '2026-10-27T01:15:00.000Z', date_tz: 'Asia/Shanghai' }}
    />,
  );
  expect(screen.getByLabelText('date', { selector: 'input' })).toHaveValue('2026-10-27T09:15');
  await user.selectOptions(screen.getByRole('combobox', { name: 'date_tz' }), 'UTC');
  expect(screen.getByLabelText('date', { selector: 'input' })).toHaveValue('2026-10-27T01:15');
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
    date: '2026-10-27T01:15:00.000Z',
    date_tz: 'UTC',
  });
});
