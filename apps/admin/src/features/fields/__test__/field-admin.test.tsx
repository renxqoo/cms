import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { Harness, node } from './support';
import { copyFieldData } from '../copy-data';
import { AdminComponentsProvider } from '../../admin-components/registry';
import type { FieldComponentProps } from '../../admin-components/types';

it('keeps UI readOnly independent from field permission and allows explicit child overrides only within writable pages', async () => {
  const layout = [
    node('Panel', {
      type: 'group',
      readOnly: true,
      children: [
        node('Locked'),
        node('Editable', { readOnly: false }),
        node('Denied', { readOnly: false, write: 'denied' }),
      ],
    }),
  ];
  const view = render(
    <Harness layout={layout} initial={{ Panel: { Locked: 'A', Editable: 'B', Denied: 'C' } }} />,
  );
  expect(screen.getByLabelText('Locked')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Editable')).not.toHaveAttribute('readonly');
  expect(screen.getByLabelText('Denied')).toHaveAttribute('readonly');
  await userEvent.type(screen.getByLabelText('Editable'), '!');
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}') as unknown).toMatchObject({
    Panel: { Editable: 'B!' },
  });
  view.rerender(
    <Harness
      layout={layout}
      initial={{ Panel: { Locked: 'A', Editable: 'B', Denied: 'C' } }}
      readOnly
    />,
  );
  expect(screen.getByLabelText('Editable')).toHaveAttribute('readonly');
});
it('renders localized descriptor help, input placeholders, width and accessible sidebar fields while hiding admin-only controls', () => {
  render(
    <Harness
      layout={[
        node('Main', { placeholder: 'Write a title', description: 'Visible help', width: '50%' }),
        node('Hidden', { hidden: true }),
        node('Aside', { position: 'sidebar', width: 240 }),
      ]}
      initial={{ Hidden: 'Preserved' }}
    />,
  );
  expect(screen.getByPlaceholderText('Write a title')).toBeVisible();
  expect(screen.getByText('Visible help')).toBeVisible();
  expect(screen.getByLabelText('Main')).toHaveAccessibleDescription('Visible help');
  expect(screen.queryByLabelText('Hidden')).toBeNull();
  expect(screen.getByLabelText('Data').textContent).toContain('Preserved');
  const sidebar = screen.getByRole('complementary', { name: 'Sidebar fields' });
  expect(within(sidebar).getByLabelText('Aside')).toBeVisible();
  expect(screen.getByLabelText('Main').closest('[style]')?.getAttribute('style')).toContain(
    '--field-width: 50%',
  );
});
it('clears duplicate-only source values through groups, tabs, rows and blocks while retaining safe defaults for the copy form', () => {
  const layout = [
    node('Token', { disableDuplicate: true, constraints: { defaultValue: 'new' } }),
    node('Group', {
      type: 'group',
      children: [node('Secret', { disableDuplicate: true }), node('Kept')],
    }),
    node('Rows', {
      type: 'array',
      children: [node('Secret', { disableDuplicate: true }), node('Kept')],
    }),
    node('Blocks', {
      type: 'blocks',
      blocks: [
        {
          id: 'card',
          key: 'card',
          label: 'Card',
          children: [node('Secret', { disableDuplicate: true })],
        },
      ],
    }),
    node('Row', {
      type: 'row',
      name: undefined,
      children: [node('InlineSecret', { disableDuplicate: true })],
    }),
    node('Tabs', {
      type: 'tabs',
      name: undefined,
      tabs: [
        {
          id: 'inline',
          label: 'Inline',
          children: [node('TabSecret', { disableDuplicate: true })],
        },
        {
          id: 'optional',
          name: 'Optional',
          label: 'Optional',
          children: [node('OptionalSecret', { disableDuplicate: true })],
        },
        {
          id: 'named',
          name: 'Named',
          label: 'Named',
          children: [node('Secret', { disableDuplicate: true })],
        },
      ],
    }),
  ];
  const result = copyFieldData(layout, {
    Token: 'old',
    InlineSecret: 'old',
    TabSecret: 'old',
    Group: { Secret: 'old', Kept: 'keep' },
    Rows: [{ id: 'row', Secret: 'old', Kept: 'keep' }],
    Blocks: [{ id: 'block', blockType: 'card', Secret: 'old' }],
    Named: { Secret: 'old' },
  });
  expect(result).toEqual({
    Token: 'new',
    Group: { Kept: 'keep' },
    Rows: [{ id: 'row', Kept: 'keep' }],
    Blocks: [{ id: 'block', blockType: 'card' }],
    Named: {},
  });
});

function BlockDescription({ node: field }: FieldComponentProps) {
  return <div>{field.label} block help</div>;
}
it('regression: custom block descriptions render once without invalid paragraph descendants for scalar and advanced controls', () => {
  const { container } = render(
    <AdminComponentsProvider
      registry={{
        versions: { 'test/help': '1' },
        fields: { Description: { 'test/help': BlockDescription } },
        cells: {},
        collections: {},
      }}
    >
      <Harness
        layout={[
          node('Text', { components: { Description: 'test/help' } }),
          node('Related', {
            type: 'relationship',
            constraints: { relationTo: ['pages'] },
            components: { Description: 'test/help' },
          }),
        ]}
      />
    </AdminComponentsProvider>,
  );
  expect(container.querySelector('p div')).toBeNull();
  expect(screen.getAllByText('Text block help')).toHaveLength(1);
  expect(screen.getAllByText('Related block help')).toHaveLength(1);
});
