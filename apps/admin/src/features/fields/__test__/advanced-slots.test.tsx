import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AdminComponentsProvider } from '../../admin-components/registry';
import type { AdminComponentRegistry, FieldComponentProps } from '../../admin-components/types';
import type { FieldData } from '../types';
import { Harness, node, rowA } from './support';

function Notice({ customProps, onChange, readOnly }: FieldComponentProps) {
  return (
    <section>
      <p>
        {typeof customProps?.['caption'] === 'string' ? customProps['caption'] : 'Missing props'}
      </p>
      <p>{readOnly ? 'Read only widget' : 'Interactive widget'}</p>
      <button onClick={() => onChange('Should not persist')}>Try UI value</button>
    </section>
  );
}
function RowTitle({ customProps, rowIndex, children }: FieldComponentProps) {
  return (
    <>
      <span>
        {typeof customProps?.['caption'] === 'string' ? customProps['caption'] : 'Row'} {rowIndex}
      </span>
      {children}
    </>
  );
}
function BlockTitle() {
  return <span>Custom block label</span>;
}
function Block({ children }: FieldComponentProps) {
  return <article aria-label="Custom block body">{children}</article>;
}
const registry: AdminComponentRegistry = {
  versions: { 'site/notice': '1', 'site/row': '1' },
  cells: {},
  collections: {},
  fields: {
    beforeInput: { 'site/notice': Notice },
    Field: { 'site/notice': Notice },
    RowLabel: { 'site/row': RowTitle },
    Label: { 'site/row': BlockTitle },
    Block: { 'site/row': Block },
  },
};

it('UI-only fields consume validated server props, disabled slots hide controls and UI callbacks never enter document data', async () => {
  const user = userEvent.setup();
  const changed = vi.fn<(value: FieldData) => void>();
  render(
    <AdminComponentsProvider registry={registry}>
      <Harness
        initial={{ title: 'Retained' }}
        onChange={changed}
        layout={[
          node('title', { components: { Field: false } }),
          node('notice', {
            type: 'ui',
            write: 'denied',
            components: { Field: { id: 'site/notice', props: { caption: 'Configured' } } },
          }),
        ]}
        componentProps={{
          'notice#notice:Field:site/notice': { caption: 'Authorized server props' },
        }}
      />
    </AdminComponentsProvider>,
  );
  expect(screen.getByText('Authorized server props')).toBeInTheDocument();
  expect(screen.getByText('Interactive widget')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Try UI value' }));
  expect(changed).not.toHaveBeenCalled();
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '')).toEqual({
    title: 'Retained',
  });
});

it('missing validated props fail visibly while preserving the form value', () => {
  render(
    <AdminComponentsProvider registry={registry}>
      <Harness
        initial={{ title: 'Retained' }}
        layout={[
          node('notice', {
            type: 'ui',
            write: 'denied',
            components: { Field: { id: 'site/notice', props: { caption: 'Unvalidated' } } },
          }),
        ]}
      />
    </AdminComponentsProvider>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('The custom component is unavailable');
  expect(screen.queryByText('Unvalidated')).not.toBeInTheDocument();
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '')).toEqual({
    title: 'Retained',
  });
});

it('row labels, block labels and custom block bodies retain stable nested editing behavior', async () => {
  const user = userEvent.setup();
  render(
    <AdminComponentsProvider registry={registry}>
      <Harness
        initial={{ blocks: [{ id: rowA, blockType: 'section', heading: 'Kept' }] }}
        layout={[
          node('blocks', {
            type: 'blocks',
            components: { RowLabel: 'site/row' },
            blocks: [
              {
                id: 'section',
                key: 'section',
                label: 'Section',
                components: { Label: 'site/row', Block: 'site/row' },
                children: [node('heading')],
              },
            ],
          }),
        ]}
        componentProps={{ [`blocks.${rowA}#blocks:RowLabel:site/row`]: { caption: 'Custom row' } }}
      />
    </AdminComponentsProvider>,
  );
  expect(screen.getByText('Custom row 0')).toBeInTheDocument();
  expect(screen.getByText('Custom block label')).toBeInTheDocument();
  const block = screen.getByRole('article', { name: 'Custom block body' });
  const input = within(block).getByRole('textbox', { name: 'heading' });
  await user.clear(input);
  await user.type(input, 'Edited');
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '')).toEqual({
    blocks: [{ id: rowA, blockType: 'section', heading: 'Edited' }],
  });
});

it('candidate choice options narrow select, radio and addable block types while existing block rows remain editable', async () => {
  const user = userEvent.setup();
  render(
    <Harness
      initial={{ blocks: [{ id: rowA, blockType: 'alpha', heading: 'Kept' }] }}
      layout={[
        node('kind', {
          type: 'select',
          constraints: {
            options: [
              { value: 'a', label: 'Alpha' },
              { value: 'b', label: 'Beta' },
            ],
          },
        }),
        node('radio', { type: 'radio', constraints: { options: ['a', 'b'] } }),
        node('blocks', {
          type: 'blocks',
          blocks: [
            { id: 'alpha', key: 'alpha', label: 'Alpha block', children: [node('heading')] },
            { id: 'beta', key: 'beta', label: 'Beta block', children: [node('description')] },
          ],
        }),
      ]}
      choiceOptions={{
        'kind#kind': [{ value: 'b', label: 'Beta' }],
        'radio#radio': ['b'],
        'blocks#blocks': ['beta'],
      }}
    />,
  );
  expect(screen.queryByRole('option', { name: 'Alpha' })).not.toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: 'a' })).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'b' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'heading' })).toHaveValue('Kept');
  expect(screen.queryByRole('option', { name: 'Alpha block' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add' }));
  const value: unknown = JSON.parse(screen.getByLabelText('Data').textContent ?? '');
  expect(value).toHaveProperty('blocks.length', 2);
  expect(value).toMatchObject({ blocks: [{ id: rowA }, { blockType: 'beta' }] });
});

it('a UI vessel can render arbitrary registered content without a Field and hide without losing data', async () => {
  const user = userEvent.setup();
  const display = (
    <AdminComponentsProvider registry={registry}>
      <Harness
        initial={{ title: 'Retained' }}
        layout={[
          node('notice', {
            type: 'ui',
            write: 'denied',
            components: { beforeInput: ['site/notice'] },
          }),
        ]}
        componentProps={{
          'notice#notice:beforeInput:site/notice:0': { caption: 'Vessel content' },
        }}
      />
    </AdminComponentsProvider>
  );
  const view = render(display);
  expect(screen.getByText('Vessel content')).toBeVisible();
  expect(screen.getByText('Interactive widget')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Try UI value' }));
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '')).toEqual({
    title: 'Retained',
  });
  view.rerender(
    <AdminComponentsProvider registry={registry}>
      <Harness
        initial={{ title: 'Retained' }}
        layout={[
          node('notice', {
            type: 'ui',
            write: 'denied',
            disabled: { field: true, column: false, filter: false, bulkEdit: true },
            components: { beforeInput: ['site/notice'] },
          }),
        ]}
        componentProps={{
          'notice#notice:beforeInput:site/notice:0': { caption: 'Vessel content' },
        }}
      />
    </AdminComponentsProvider>,
  );
  expect(screen.getByText('Vessel content')).not.toBeVisible();
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '')).toEqual({
    title: 'Retained',
  });
});

it('regression: repeated registered input content retains independent validated props', () => {
  render(
    <AdminComponentsProvider registry={registry}>
      <Harness
        layout={[
          node('notice', {
            type: 'ui',
            components: {
              beforeInput: [
                { id: 'site/notice', props: { caption: 'First' } },
                { id: 'site/notice', props: { caption: 'Second' } },
              ],
            },
          }),
        ]}
        componentProps={{
          'notice#notice:beforeInput:site/notice:0': { caption: 'First instance' },
          'notice#notice:beforeInput:site/notice:1': { caption: 'Second instance' },
        }}
      />
    </AdminComponentsProvider>,
  );
  expect(screen.getByText('First instance')).toBeInTheDocument();
  expect(screen.getByText('Second instance')).toBeInTheDocument();
});

function DraftControl({ value, onChange, onValidityChange, readOnly }: FieldComponentProps) {
  const [draft, setDraft] = useState(
    typeof value === 'number' || typeof value === 'string' ? String(value) : '',
  );
  return (
    <input
      aria-label="Custom numeric draft"
      value={draft}
      readOnly={readOnly}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setDraft(next);
        const valid = /^\d+$/.test(next);
        onValidityChange?.('number', valid ? null : 'Enter a whole number');
        if (valid) onChange(Number(next));
      }}
    />
  );
}
it('custom controls retain invalid drafts and release only their own validation errors when hidden or removed', async () => {
  const user = userEvent.setup();
  const configured = { ...registry, fields: { Field: { 'site/notice': DraftControl } } };
  function display(disabled = false) {
    return (
      <AdminComponentsProvider registry={configured}>
        <Harness
          initial={{ score: 4, title: 'Retained' }}
          layout={[
            node('score', {
              components: { Field: 'site/notice' },
              disabled: { field: disabled, column: false, filter: false, bulkEdit: false },
            }),
          ]}
        />
      </AdminComponentsProvider>
    );
  }
  const view = render(display());
  const input = screen.getByRole('textbox', { name: 'Custom numeric draft' });
  await user.clear(input);
  await user.type(input, 'invalid');
  expect(input).toHaveValue('invalid');
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '')).toEqual({
    score: 4,
    title: 'Retained',
  });
  expect(screen.getByLabelText('Invalid')).toHaveTextContent('Enter a whole number');
  view.rerender(display(true));
  expect(screen.getByLabelText('Invalid')).toHaveTextContent('{}');
  view.rerender(display());
  expect(screen.getByRole('textbox', { name: 'Custom numeric draft' })).toHaveValue('invalid');
  await user.clear(input);
  await user.type(input, '12');
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '')).toEqual({
    score: 12,
    title: 'Retained',
  });
  expect(screen.getByLabelText('Invalid')).toHaveTextContent('{}');
  await user.clear(input);
  expect(screen.getByLabelText('Invalid')).toHaveTextContent('Enter a whole number');
  view.rerender(
    <AdminComponentsProvider registry={configured}>
      <Harness initial={{ score: 4, title: 'Retained' }} layout={[]} />
    </AdminComponentsProvider>,
  );
  expect(screen.getByLabelText('Invalid')).toHaveTextContent('{}');
});
