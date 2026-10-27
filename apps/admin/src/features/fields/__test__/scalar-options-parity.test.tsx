import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { Harness, node } from './support';

afterEach(() => vi.restoreAllMocks());

function measuredRows() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const position = [...document.querySelectorAll('[role="listitem"]')].indexOf(this);
    const top = Math.max(0, position) * 40;
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      right: 200,
      bottom: top + 40,
      width: 200,
      height: 40,
      toJSON: () => ({}),
    };
  });
}

function data(): unknown {
  return JSON.parse(screen.getByLabelText('Data').textContent ?? '{}');
}
function invalid(): unknown {
  return JSON.parse(screen.getByLabelText('Invalid').textContent ?? '{}');
}

it('edits ordered primitive arrays, allows duplicate text and preserves row drafts during keyboard sorting', async () => {
  measuredRows();
  const user = userEvent.setup();
  render(
    <Harness
      layout={[node('Aliases', { constraints: { hasMany: true, minRows: 1, maxRows: 3 } })]}
      initial={{ Aliases: ['first', 'second'] }}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Aliases 2' }), {
    target: { value: 'first' },
  });
  expect(data()).toEqual({ Aliases: ['first', 'first'] });
  fireEvent.change(screen.getByRole('textbox', { name: 'Aliases 2' }), {
    target: { value: 'second' },
  });
  const handle = screen.getByRole('button', { name: 'Move up / Move down: Aliases 1' });
  handle.focus();
  await user.keyboard('[Space][ArrowDown][Space]');
  expect(data()).toEqual({ Aliases: ['second', 'first'] });
  expect(screen.getByRole('textbox', { name: 'Aliases 1' })).toHaveValue('second');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Aliases 3' }), {
    target: { value: 'third' },
  });
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Remove Aliases 2' }));
  expect(data()).toEqual({ Aliases: ['second', 'third'] });
});

it('keeps invalid primitive numbers out of data and removes their validity registration with the row', async () => {
  const user = userEvent.setup();
  render(
    <Harness
      layout={[
        node('Ratings', {
          type: 'number',
          constraints: { hasMany: true, min: 0, max: 10, minRows: 1, maxRows: 2 },
        }),
      ]}
      initial={{ Ratings: [0] }}
    />,
  );
  expect(screen.getByRole('button', { name: 'Remove Ratings 1' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Ratings 2' }), {
    target: { value: 'invalid' },
  });
  expect(data()).toEqual({ Ratings: [0, 0] });
  const errors = invalid();
  expect(errors).toBeTypeOf('object');
  if (errors === null || typeof errors !== 'object') throw new Error('Expected error registry');
  expect(Object.keys(errors)).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Remove Ratings 2' }));
  expect(data()).toEqual({ Ratings: [0] });
  expect(invalid()).toEqual({});
});

it('uses interface-language option labels while storing radio and select values', async () => {
  const user = userEvent.setup();
  const options = [
    { value: 'calm', label: { en: 'Calm', zh: '平静' } },
    { value: 'bold', label: 'Bold' },
  ];
  render(
    <Harness
      language="zh"
      contentLocale="en"
      layout={[
        node('Tone', { type: 'radio', constraints: { options } }),
        node('Style', { type: 'select', constraints: { options } }),
      ]}
    />,
  );
  await user.click(screen.getByRole('radio', { name: '平静' }));
  const select = screen.getByRole('combobox', { name: 'Style' });
  expect(within(select).getByRole('option', { name: '平静' })).toHaveValue('calm');
  fireEvent.change(select, { target: { value: 'bold' } });
  expect(data()).toEqual({ Tone: 'calm', Style: 'bold' });
});
