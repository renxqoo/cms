import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { enUS } from 'date-fns/locale';
import { expect, it, vi } from 'vitest';
import { DatePicker } from '../forms/date-picker.tsx';
import type { DatePickerAppearance, DatePickerProps } from '../forms/date-picker.tsx';

const reference = new Date('2026-10-26T08:30:00Z');

function format(date: Date, appearance: DatePickerAppearance) {
  const value = date.toISOString();
  if (appearance === 'timeOnly') return value.slice(11, 16);
  if (appearance === 'monthOnly') return value.slice(0, 7);
  if (appearance === 'dayOnly') return value.slice(5, 10);
  if (appearance === 'dayAndTime') return value.slice(0, 16).replace('T', ' ');
  return value.slice(0, 10);
}

function props(changes: Partial<DatePickerProps> = {}): DatePickerProps {
  return {
    label: 'Publication date UTC',
    placeholder: 'Choose a date',
    value: reference,
    referenceDate: reference,
    locale: enUS,
    timeIntervals: 15,
    format,
    labels: {
      clear: 'Clear publication date',
      time: 'Time UTC',
      previousMonth: 'Previous month',
      nextMonth: 'Next month',
      invalid: 'The date or date limits are invalid',
      day: (date) => date.toISOString().slice(0, 10),
    },
    onChange: vi.fn<(value: Date | null) => void>(),
    ...changes,
  };
}

function Picker({ settings }: { settings: DatePickerProps }) {
  const [value, setValue] = useState(settings.value);
  return (
    <DatePicker
      {...settings}
      value={value}
      onChange={(next) => {
        setValue(next);
        settings.onChange(next);
      }}
    />
  );
}

it('selects a UTC calendar day, closes the calendar and clears to null', async () => {
  const settings = props();
  const user = userEvent.setup();
  render(<Picker settings={settings} />);
  await user.click(screen.getByRole('button', { name: settings.label }));
  await user.click(screen.getByRole('button', { name: '2026-10-27' }));
  expect(settings.onChange).toHaveBeenLastCalledWith(new Date('2026-10-27T00:00:00Z'));
  expect(screen.getByRole('button', { name: settings.label })).toHaveTextContent('2026-10-27');
  await user.click(screen.getByRole('button', { name: settings.labels.clear }));
  expect(settings.onChange).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole('button', { name: settings.label })).toHaveTextContent('Choose a date');
  expect(screen.getByRole('button', { name: settings.labels.clear })).toBeDisabled();
});

it('shows day and month while retaining the explicit reference year', async () => {
  const settings = props({ appearance: 'dayOnly', value: null });
  const user = userEvent.setup();
  render(<Picker settings={settings} />);
  await user.click(screen.getByRole('button', { name: settings.label }));
  await user.click(screen.getByRole('button', { name: '2026-10-28' }));
  expect(settings.onChange).toHaveBeenCalledWith(new Date('2026-10-28T00:00:00Z'));
  expect(screen.getByRole('button', { name: settings.label })).toHaveTextContent('10-28');
});

it('preserves UTC time when changing the day and edits minutes independently', async () => {
  const settings = props({ appearance: 'dayAndTime' });
  const user = userEvent.setup();
  render(<Picker settings={settings} />);
  await user.click(screen.getByRole('button', { name: settings.label }));
  await user.click(screen.getByRole('button', { name: '2026-10-27' }));
  expect(settings.onChange).toHaveBeenLastCalledWith(new Date('2026-10-27T08:30:00Z'));
  fireEvent.change(screen.getByLabelText('Time UTC'), { target: { value: '12:15' } });
  expect(settings.onChange).toHaveBeenLastCalledWith(new Date('2026-10-27T12:15:00Z'));
  fireEvent.change(screen.getByLabelText('Time UTC'), { target: { value: '' } });
  expect(settings.onChange).toHaveBeenLastCalledWith(null);
});

it('uses the supplied calendar reference for a time-only value', () => {
  const settings = props({ appearance: 'timeOnly', value: null });
  render(<Picker settings={settings} />);
  fireEvent.change(screen.getByLabelText(settings.label), { target: { value: '09:45' } });
  expect(settings.onChange).toHaveBeenLastCalledWith(new Date('2026-10-26T09:45:00Z'));
  expect(screen.getByLabelText(settings.label)).toHaveValue('09:45');
});

it('selects and clears a month, including years before 0100', () => {
  const settings = props({ appearance: 'monthOnly' });
  render(<Picker settings={settings} />);
  const input = screen.getByLabelText(settings.label);
  fireEvent.change(input, { target: { value: '2027-02' } });
  expect(settings.onChange).toHaveBeenLastCalledWith(new Date('2027-02-01T00:00:00Z'));
  fireEvent.change(input, { target: { value: '0007-03' } });
  expect(settings.onChange).toHaveBeenLastCalledWith(new Date('0007-03-01T00:00:00Z'));
  fireEvent.change(input, { target: { value: '' } });
  expect(settings.onChange).toHaveBeenLastCalledWith(null);
});

it('prevents calendar choices before or after the configured UTC dates', async () => {
  const settings = props({
    minDate: new Date('2026-10-26T23:00:00Z'),
    maxDate: new Date('2026-10-27T00:00:00Z'),
    monthsToShow: 2,
  });
  const user = userEvent.setup();
  render(<DatePicker {...settings} />);
  await user.click(screen.getByRole('button', { name: settings.label }));
  expect(screen.getByRole('button', { name: '2026-10-25' })).toBeDisabled();
  expect(
    screen
      .getAllByRole('button', { name: '2026-10-28' })
      .every((button) => button.hasAttribute('disabled')),
  ).toBe(true);
  await user.click(screen.getByRole('button', { name: '2026-10-27' }));
  expect(settings.onChange).toHaveBeenCalledWith(new Date('2026-10-27T00:00:00Z'));
});

it('applies month bounds at month precision and time bounds at minute precision', () => {
  const changed = vi.fn<(value: Date | null) => void>();
  const settings = props({
    appearance: 'monthOnly',
    minDate: new Date('2026-10-15T00:00:00Z'),
    maxDate: new Date('2026-12-20T00:00:00Z'),
    onChange: changed,
  });
  const { rerender } = render(<DatePicker {...settings} />);
  fireEvent.change(screen.getByLabelText(settings.label), { target: { value: '2026-09' } });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(settings.label), { target: { value: '2026-12' } });
  expect(changed).toHaveBeenCalledWith(new Date('2026-12-01T00:00:00Z'));
  changed.mockClear();
  rerender(
    <DatePicker
      {...props({
        appearance: 'timeOnly',
        minDate: new Date('2026-10-26T08:30:30Z'),
        maxDate: new Date('2026-10-26T10:00:00Z'),
        onChange: changed,
      })}
    />,
  );
  fireEvent.change(screen.getByLabelText(settings.label), { target: { value: '08:00' } });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(settings.label), { target: { value: '10:00' } });
  expect(changed).toHaveBeenCalledWith(new Date('2026-10-26T10:00:00Z'));
});

it.each([{ readOnly: true }, { disabled: true }])(
  'prevents edits and clear in an unavailable control',
  async (state) => {
    const settings = props(state);
    const user = userEvent.setup();
    const { rerender } = render(<DatePicker {...settings} />);
    expect(screen.getByRole('button', { name: settings.label })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: settings.labels.clear }));
    expect(settings.onChange).not.toHaveBeenCalled();
    rerender(<DatePicker {...settings} appearance="timeOnly" />);
    fireEvent.change(screen.getByLabelText(settings.label), { target: { value: '09:00' } });
    expect(settings.onChange).not.toHaveBeenCalled();
  },
);

it.each([
  { value: new Date('invalid') },
  { referenceDate: new Date('invalid') },
  { timeIntervals: 0 },
  { timeIntervals: 1441 },
  { minDate: new Date('2026-11-01T00:00:00Z'), maxDate: new Date('2026-10-01T00:00:00Z') },
])('reports invalid values or picker configuration without emitting a date', (invalid) => {
  const settings = props(invalid);
  render(<DatePicker {...settings} />);
  expect(screen.getByRole('alert')).toHaveTextContent(settings.labels.invalid);
  expect(settings.onChange).not.toHaveBeenCalled();
});

it('regression: an out-of-bounds controlled value remains editable and reports its error', () => {
  const settings = props({ appearance: 'timeOnly', minDate: new Date('2026-10-26T09:00:00Z') });
  render(<Picker settings={settings} />);
  expect(screen.getByRole('alert')).toHaveTextContent(settings.labels.invalid);
  fireEvent.change(screen.getByLabelText(settings.label), { target: { value: '09:15' } });
  expect(settings.onChange).toHaveBeenCalledWith(new Date('2026-10-26T09:15:00Z'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each([
  { value: '2026-10-27T08:30:00Z', min: undefined, max: undefined },
  { value: '2026-10-26T13:00:00Z', min: '12:00', max: undefined },
  { value: '2026-10-28T17:00:00Z', min: undefined, max: '18:00' },
])(
  'regression: full datetime boundaries only constrain native time on their own UTC day ($value)',
  ({ value, min, max }) => {
    render(
      <form aria-label="Publication">
        <DatePicker
          {...props({
            appearance: 'dayAndTime',
            value: new Date(value),
            minDate: new Date('2026-10-26T12:00:00Z'),
            maxDate: new Date('2026-10-28T18:00:00Z'),
          })}
        />
      </form>,
    );
    const time = screen.getByLabelText('Time UTC');
    expect(time).toBeValid();
    expect(screen.getByRole('form', { name: 'Publication' })).toBeValid();
    expect(time.getAttribute('min')).toBe(min ?? null);
    expect(time.getAttribute('max')).toBe(max ?? null);
  },
);
