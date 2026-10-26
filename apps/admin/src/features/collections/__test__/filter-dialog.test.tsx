import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ContentWhere } from '../content-query';
import { ContentFilterDialog } from '../content-filter-dialog';
import { contentMessages } from '../content-messages';
import { snapshot } from './support';
afterEach(() => cleanup());
function view(initial?: ContentWhere) {
  const onApply = vi.fn<(value?: ContentWhere) => void>();
  const onClose = vi.fn<() => void>();
  const { collection } = snapshot();
  collection.fields.push(
    {
      id: 'count',
      path: 'count',
      type: 'number',
      label: 'Count',
      required: false,
      localized: false,
      queryable: true,
    },
    {
      id: 'enabled',
      path: 'enabled',
      type: 'boolean',
      label: 'Enabled',
      required: false,
      localized: false,
      queryable: true,
    },
  );
  render(
    <ContentFilterDialog
      collection={collection}
      initial={initial}
      onApply={onApply}
      onClose={onClose}
      messages={contentMessages.en}
    />,
  );
  return { onApply, onClose };
}
it('builds nested OR and AND conditions and removes a condition before applying the actual tree', () => {
  const test = view();
  fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: 'first' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
  const values = screen.getAllByRole('textbox', { name: 'Value' });
  if (!values[1]) throw new Error('Missing condition');
  fireEvent.change(values[1], { target: { value: 'second' } });
  const modes = screen.getAllByRole('combobox', { name: 'Operator' });
  if (!modes[0]) throw new Error('Missing group');
  fireEvent.change(modes[0], { target: { value: 'or' } });
  fireEvent.click(screen.getByRole('button', { name: 'AND / OR' }));
  const remove = screen.getAllByRole('button', { name: 'Remove filter' });
  if (!remove[1]) throw new Error('Missing remove');
  fireEvent.click(remove[1]);
  const inputs = screen.getAllByRole('textbox', { name: 'Value' });
  if (!inputs[1]) throw new Error('Missing nested value');
  fireEvent.change(inputs[1], { target: { value: 'nested' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(test.onApply).toHaveBeenCalledExactlyOnceWith({
    or: [
      { field: 'title', operator: 'eq', value: 'first' },
      { and: [{ field: 'title', operator: 'eq', value: 'nested' }] },
    ],
  });
  expect(test.onClose).toHaveBeenCalledOnce();
});
it.each([
  ['count', ''],
  ['count', 'Infinity'],
  ['enabled', 'invalid'],
] as const)('blocks invalid %s raw filter %s', (field, text) => {
  const test = view({ field, operator: 'eq', value: field === 'count' ? 1 : true });
  fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: text } });
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  expect(test.onApply).not.toHaveBeenCalled();
});
it.each([
  ['count', '42', 42],
  ['enabled', 'false', false],
] as const)('parses valid %s raw filter %s', (field, text, expected) => {
  const test = view({ field, operator: 'eq', value: field === 'count' ? 1 : true });
  fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(test.onApply).toHaveBeenCalledExactlyOnceWith({ field, operator: 'eq', value: expected });
});
it('clears all existing filters by explicit action and supports cancelling without applying a draft', () => {
  const test = view({ field: 'title', operator: 'eq', value: 'existing' });
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear search' }));
  expect(test.onApply).toHaveBeenCalledExactlyOnceWith();
  expect(test.onClose).toHaveBeenCalledOnce();
  cleanup();
  const cancelled = view();
  fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: 'unsent' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancelled.onApply).not.toHaveBeenCalled();
  expect(cancelled.onClose).toHaveBeenCalledOnce();
});
it('regression: removing an earlier sibling preserves a later condition raw invalid draft and its save block', () => {
  view();
  fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: 'first' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
  const [, , operator] = screen.getAllByRole('combobox', { name: 'Operator' });
  if (!operator) throw new Error('Missing second operator');
  fireEvent.change(operator, { target: { value: 'in' } });
  const [, input] = screen.getAllByRole('textbox', { name: 'Value' });
  if (!input) throw new Error('Missing second value');
  fireEvent.change(input, { target: { value: 'preserve invalid JSON' } });
  const [remove] = screen.getAllByRole('button', { name: 'Remove filter' });
  if (!remove) throw new Error('Missing first remove');
  fireEvent.click(remove);
  expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('preserve invalid JSON');
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), {
    target: { value: '["fixed"]' },
  });
  expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
});
