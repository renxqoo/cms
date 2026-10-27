import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AdminComponentsProvider } from '../../admin-components/registry';
import type { AdminComponentRegistry, FieldComponentProps } from '../../admin-components/types';
import { Harness, node } from './support';

function Input({ id, value, onChange, readOnly }: FieldComponentProps) {
  return (
    <input
      id={id}
      value={typeof value === 'string' ? value : ''}
      readOnly={readOnly}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
function Label() {
  return <span>Registered title</span>;
}
function Description() {
  return <span>Registered description</span>;
}
function CustomError({ error }: FieldComponentProps) {
  return <strong>Registered error: {error}</strong>;
}
function Before() {
  return <span>Before input</span>;
}
function After() {
  return <span>After input</span>;
}

const registry: AdminComponentRegistry = {
  versions: {
    'site/input': '1',
    'site/label': '1',
    'site/description': '1',
    'site/error': '1',
    'site/before': '1',
    'site/after': '1',
    'site/broken': '1',
  },
  fields: {
    Field: { 'site/input': Input },
    Label: { 'site/label': Label },
    Description: { 'site/description': Description },
    Error: { 'site/error': CustomError },
    beforeInput: { 'site/before': Before },
    afterInput: { 'site/after': After },
  },
  cells: {},
  collections: {},
};
const title = node('title', {
  components: {
    Field: 'site/input',
    Label: 'site/label',
    Description: 'site/description',
    Error: 'site/error',
    beforeInput: ['site/before'],
    afterInput: ['site/after'],
  },
});

function Broken(): never {
  throw new Error('component failure');
}

it('registered field components edit through the standard value channel and retain labels, errors and read-only behavior', async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <AdminComponentsProvider registry={registry}>
      <Harness layout={[title]} initial={{ title: 'Initial' }} errors={{ title: 'Required' }} />
    </AdminComponentsProvider>,
  );
  const input = screen.getByLabelText('Registered title');
  await user.clear(input);
  await user.type(input, 'Changed');
  expect(screen.getByLabelText('Data')).toHaveTextContent('Changed');
  expect(screen.getByText('Registered description')).toBeVisible();
  expect(screen.getByText('Before input')).toBeVisible();
  expect(screen.getByText('After input')).toBeVisible();
  expect(screen.getByText('Registered error: Required')).toBeVisible();
  rerender(
    <AdminComponentsProvider registry={registry}>
      <Harness layout={[title]} initial={{ title: 'Initial' }} readOnly />
    </AdminComponentsProvider>,
  );
  expect(screen.getByLabelText('Registered title')).toHaveAttribute('readonly');
  fireEvent.change(screen.getByLabelText('Registered title'), { target: { value: 'Forbidden' } });
  expect(screen.getByLabelText('Data')).toHaveTextContent('Changed');
});

it('regression: condition hiding preserves local invalid input and restores it when the field becomes visible again', async () => {
  const user = userEvent.setup();
  const field = node('number', { type: 'number', condition: true });
  const { rerender } = render(
    <Harness layout={[field]} initial={{ number: 2 }} visibility={{ 'number#number': true }} />,
  );
  const input = screen.getByRole('textbox', { name: 'number' });
  await user.clear(input);
  await user.type(input, 'invalid');
  rerender(
    <Harness layout={[field]} initial={{ number: 2 }} visibility={{ 'number#number': false }} />,
  );
  expect(input).not.toBeVisible();
  rerender(
    <Harness layout={[field]} initial={{ number: 2 }} visibility={{ 'number#number': true }} />,
  );
  expect(screen.getByRole('textbox', { name: 'number' })).toHaveValue('invalid');
  expect(screen.getByLabelText('Data')).toHaveTextContent('{"number":null}');
});

it('a failing registered component leaves its value available through the default field instead of discarding it', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(
      <AdminComponentsProvider
        registry={{ ...registry, fields: { Field: { 'site/broken': Broken } } }}
      >
        <Harness
          layout={[node('title', { components: { Field: 'site/broken' } })]}
          initial={{ title: 'Retained' }}
        />
      </AdminComponentsProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('custom component is unavailable');
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Retained');
    expect(screen.getByLabelText('Data')).toHaveTextContent('Retained');
  } finally {
    log.mockRestore();
  }
});
