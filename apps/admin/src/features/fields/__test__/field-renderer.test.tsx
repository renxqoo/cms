import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Harness, node, rowA, rowB, services } from './support';
import type { CodeEditorProps } from '@new-cms/ui/forms';
import type * as FormExports from '@new-cms/ui/forms';
import type { ReactElement } from 'react';

vi.mock('@new-cms/ui/forms', async () => {
  const actual = await vi.importActual<typeof FormExports>('@new-cms/ui/forms');
  return {
    ...actual,
    CodeEditor: ({ label, value, onChange, readOnly, onRetry, retryLabel }: CodeEditorProps) => (
      <div>
        <textarea
          aria-label={label}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <button onClick={onRetry}>{retryLabel}</button>
      </div>
    ),
  };
});

function data() {
  return JSON.parse(screen.getByLabelText('Data').textContent ?? '{}') as unknown;
}
function invalid() {
  return JSON.parse(screen.getByLabelText('Invalid').textContent ?? '{}') as unknown;
}

describe('scalar field editing', () => {
  it('edits text, textarea, email, decimal, boolean, date, select and code without enforcing draft completeness', () => {
    render(
      <Harness
        layout={[
          node('Title', { required: true, localized: true, write: 'conditional' }),
          node('Summary', { type: 'textarea' }),
          node('Email', { type: 'email' }),
          node('Number', { type: 'number' }),
          node('Enabled', { type: 'boolean' }),
          node('Date', { type: 'date' }),
          node('Status', { type: 'select', constraints: { options: ['draft', 'live'] } }),
          node('Code', { type: 'code', constraints: { maxLength: 3 } }),
        ]}
      />,
    );
    expect(screen.getByLabelText(/Title/)).not.toBeRequired();
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Description' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dev@example.com' } });
    fireEvent.change(screen.getByLabelText('Number'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('radio', { name: 'No' }));
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-10-26T01:02:03.456' },
    });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'live' } });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'abc' } });
    expect(data()).toEqual({
      Title: 'Hello',
      Summary: 'Description',
      Email: 'dev@example.com',
      Number: 0,
      Enabled: false,
      Date: '2026-10-26T01:02:03.456Z',
      Status: 'live',
      Code: 'abc',
    });
    expect(invalid()).toEqual({});
    expect(screen.getByText('Write access is checked again on submission')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'abcd' } });
    expect(invalid()).toEqual({ 'fields/Code': 'Check the format or range of this value.' });
    expect(data()).toMatchObject({ Code: 'abc' });
  });
  it('clearing an invalid scalar resets both its visible draft and save validity', () => {
    render(<Harness layout={[node('Number', { type: 'number' })]} initial={{ Number: 12 }} />);
    fireEvent.change(screen.getByLabelText('Number'), { target: { value: '--' } });
    expect(invalid()).toEqual({ 'fields/Number': 'Check the format or range of this value.' });
    expect(data()).toEqual({ Number: 12 });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Number')).toHaveValue('');
    expect(data()).toEqual({ Number: null });
    expect(invalid()).toEqual({});
  });
  it('keeps invalid JSON raw text, preserves parsed data and clears validity on removal', () => {
    const validity = vi.fn<(key: string, error: string | null) => void>();
    const view = render(
      <Harness
        layout={[node('JSON', { type: 'json' })]}
        initial={{ JSON: { count: 1 } }}
        onValidityChange={validity}
      />,
    );
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '{broken' } });
    expect(screen.getByLabelText('JSON')).toHaveValue('{broken');
    expect(data()).toEqual({ JSON: { count: 1 } });
    expect(invalid()).toEqual({ 'fields/JSON': 'Invalid JSON. This draft cannot be saved yet.' });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByLabelText('JSON')).toHaveValue('{broken');
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '{"enabled":false}' } });
    expect(data()).toEqual({ JSON: { enabled: false } });
    expect(invalid()).toEqual({});
    view.unmount();
    expect(validity).toHaveBeenLastCalledWith('fields/JSON', null);
  });
  it('validates longitude and latitude independently, including incomplete and nondecimal drafts', () => {
    render(<Harness layout={[node('Point', { type: 'point' })]} />);
    fireEvent.change(screen.getByLabelText('Point Longitude'), { target: { value: '180' } });
    expect(invalid()).toMatchObject({ 'fields/Point': expect.any(String) as unknown });
    fireEvent.change(screen.getByLabelText('Point Latitude'), { target: { value: '-90' } });
    expect(data()).toEqual({ Point: [180, -90] });
    fireEvent.change(screen.getByLabelText('Point Longitude'), { target: { value: '181' } });
    expect(data()).toEqual({ Point: [180, -90] });
    fireEvent.change(screen.getByLabelText('Point Longitude'), { target: { value: '0x10' } });
    expect(invalid()).toMatchObject({ 'fields/Point': expect.any(String) as unknown });
    fireEvent.change(screen.getByLabelText('Point Longitude'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Point Latitude'), { target: { value: '' } });
    expect(data()).toEqual({ Point: null });
    expect(invalid()).toEqual({});
  });
  it('renders denied fields and joins read-only with server errors and explicit required enforcement', () => {
    render(
      <Harness
        enforceRequired
        layout={[
          node('Title', { required: true }),
          node('Locked', { write: 'denied' }),
          node('Derived', { type: 'join' }),
        ]}
        initial={{ Locked: 'Secret', Derived: [{ id: rowA }] }}
        errors={{ Title: 'Server validation failed' }}
      />,
    );
    expect(screen.getByLabelText(/Title/)).toBeRequired();
    expect(screen.getByLabelText(/Title/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Locked')).toHaveAttribute('readonly');
    expect(screen.getByText('Server validation failed')).toBeVisible();
    expect(screen.getByText(/Derived · Read only/)).toBeVisible();
  });
  it('uses Chinese field copy and readonly controls', () => {
    render(
      <Harness
        language="zh"
        readOnly
        layout={[
          node('状态', { type: 'select', constraints: { options: ['a'] } }),
          node('数量', { type: 'number' }),
          node('正文', { type: 'textarea' }),
          node('时间', { type: 'date' }),
        ]}
        initial={{ 数量: 2, 正文: '只读', 时间: 'invalid' }}
      />,
    );
    expect(screen.getByLabelText('状态')).toBeDisabled();
    expect(screen.getByLabelText('数量')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('正文')).toHaveValue('只读');
    expect(screen.getByText('时间使用 UTC')).toBeVisible();
    expect(screen.queryByText('清空')).not.toBeInTheDocument();
  });
});

describe('layout and stable row editing', () => {
  it('updates group, anonymous row, named tabs and anonymous tabs at their correct data paths', () => {
    const layout = [
      node('Group', { type: 'group', children: [node('Title')] }),
      node('Row', { name: undefined, type: 'row', children: [node('Slug')] }),
      node('Tabs', {
        name: undefined,
        type: 'tabs',
        tabs: [
          { id: 'seo', name: 'seo', label: 'SEO', children: [node('Caption')] },
          { id: 'extra', label: 'Extra', children: [node('Extra title')] },
        ],
      }),
    ];
    render(<Harness layout={layout} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'SEO' } });
    expect(screen.queryByLabelText('Extra title')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' });
    fireEvent.change(screen.getByLabelText('Extra title'), { target: { value: 'B' } });
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Home' });
    expect(screen.getByLabelText('Caption')).toHaveValue('SEO');
    expect(data()).toEqual({
      Group: { Title: 'A' },
      Slug: 'a',
      seo: { Caption: 'SEO' },
      'Extra title': 'B',
    });
  });
  it('retains invalid JSON across tab and collapsible visibility changes without mounting unopened editors', () => {
    render(
      <Harness
        layout={[
          node('Tabs', {
            name: undefined,
            type: 'tabs',
            tabs: [
              { id: 'one', label: 'One', children: [node('JSON', { type: 'json' })] },
              { id: 'two', label: 'Two', children: [node('Second JSON', { type: 'json' })] },
            ],
          }),
          node('Details', {
            name: undefined,
            type: 'collapsible',
            children: [node('Hidden JSON', { type: 'json' })],
          }),
        ]}
      />,
    );
    expect(screen.queryByLabelText('Second JSON')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '{broken' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.getByLabelText('JSON')).toHaveValue('{broken');
    expect(invalid()).toMatchObject({ 'fields/Tabs/one/JSON': expect.any(String) as unknown });
    fireEvent.change(screen.getByLabelText('Hidden JSON'), { target: { value: '[' } });
    fireEvent.click(screen.getByRole('button', { name: /Details/ }));
    expect(screen.getByLabelText('Hidden JSON')).toHaveValue('[');
    expect(invalid()).toMatchObject({
      'fields/Details/Hidden JSON': expect.any(String) as unknown,
    });
    fireEvent.click(screen.getByRole('button', { name: /Details/ }));
    expect(screen.getByLabelText('Hidden JSON')).toHaveValue('[');
    fireEvent.click(screen.getByRole('tab', { name: 'One' }));
    expect(screen.getByLabelText('JSON')).toHaveValue('{broken');
  });
});

describe('stable structural editing', () => {
  it('adds, moves and removes UUID rows, preserves invalid drafts during reorder and leaves unknown blocks intact', () => {
    render(
      <Harness
        layout={[
          node('Rows', {
            type: 'array',
            children: [node('JSON', { type: 'json' })],
            constraints: { max: 2 },
          }),
          node('Blocks', {
            type: 'blocks',
            blocks: [
              {
                id: 'hero',
                key: 'hero',
                label: 'Hero',
                children: [node('Caption', { constraints: { defaultValue: 'Default' } })],
              },
            ],
          }),
        ]}
        initial={{
          Rows: [
            { id: rowA, JSON: 1 },
            { id: rowB, JSON: 2 },
          ],
          Blocks: [{ id: rowA, blockType: 'removed', preserved: true }],
        }}
      />,
    );
    const inputs = screen.getAllByLabelText('JSON');
    fireEvent.change(inputs[0] ?? document.body, { target: { value: '{invalid' } });
    const rows = screen.getByRole('group', { name: 'Rows' });
    expect(within(rows).getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.click(within(rows).getByRole('button', { name: 'Move down Item 1' }));
    expect(screen.getAllByLabelText('JSON')[1]).toHaveValue('{invalid');
    expect(invalid()).toMatchObject({
      [`fields/Rows/${rowA}/JSON`]: expect.any(String) as unknown,
    });
    fireEvent.click(within(rows).getByRole('button', { name: 'Move up Item 2' }));
    fireEvent.click(within(rows).getByRole('button', { name: 'Remove Item 1' }));
    expect(invalid()).toEqual({});
    fireEvent.click(within(rows).getByRole('button', { name: 'Add' }));
    const blocks = screen.getByRole('group', { name: 'Blocks' });
    fireEvent.click(within(blocks).getByRole('button', { name: 'Add' }));
    expect(data()).toMatchObject({
      Blocks: [
        { id: rowA, blockType: 'removed', preserved: true },
        { id: expect.any(String) as unknown, blockType: 'hero', Caption: 'Default' },
      ],
      Rows: [{ id: rowB, JSON: 2 }, { id: expect.any(String) as unknown }],
    });
    expect(screen.getByText(/Unknown block/)).toBeVisible();
  });
  it('protects malformed rows and readonly structure, and supports empty block catalogs', () => {
    const view = render(
      <Harness
        layout={[node('Rows', { type: 'array', children: [] }), node('Blocks', { type: 'blocks' })]}
        initial={{ Rows: [{ title: 'Missing ID' }] }}
      />,
    );
    expect(
      screen.getByText('An item has no stable identity. Its structure cannot be changed.'),
    ).toBeVisible();
    expect(
      screen
        .getAllByRole('button', { name: 'Add' })
        .every((button) => button.hasAttribute('disabled')),
    ).toBe(true);
    view.unmount();
    render(
      <Harness
        readOnly
        layout={[node('Rows', { type: 'array', children: [node('Title')] })]}
        initial={{ Rows: [{ id: rowA, Title: 'Read only' }] }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('readonly');
  });
  it('uses stable UUID source paths for upload previews after row order changes', async () => {
    const ports = services();
    const preview = vi.fn<() => ReactElement>(() => <span>Preview</span>);
    render(
      <Harness
        services={{ ...ports, renderPreview: preview }}
        contentLocale="zh-CN"
        layout={[
          node('Rows', {
            type: 'array',
            children: [
              node('Image', {
                type: 'upload',
                constraints: { relationTo: ['images'], hasMany: true },
              }),
            ],
          }),
        ]}
        initial={{
          Rows: [
            { id: rowA, Image: [{ collection: 'images', id: rowA }] },
            { id: rowB, Image: [{ collection: 'images', id: rowB }] },
          ],
        }}
      />,
    );
    expect(preview).toHaveBeenCalledWith({
      reference: { collection: 'images', id: rowA },
      path: ['Rows', 0, 'Image', 0],
      sourcePath: `zh-CN:Rows.${rowA}.Image.0`,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move down Item 1' }));
    await waitFor(() =>
      expect(preview).toHaveBeenCalledWith({
        reference: { collection: 'images', id: rowA },
        path: ['Rows', 1, 'Image', 0],
        sourcePath: `zh-CN:Rows.${rowA}.Image.0`,
      }),
    );
  });
});

it('selects, reorders, cancels and removes multiple enum values through shared controls', async () => {
  const user = userEvent.setup();
  render(
    <Harness
      layout={[
        node('Tags', {
          type: 'select',
          constraints: { hasMany: true, options: ['alpha', 'beta', 'gamma'] },
        }),
      ]}
      initial={{ Tags: ['alpha', 'beta'] }}
    />,
  );
  screen.getByRole('button', { name: 'Move up / Move down: beta' }).focus();
  await user.keyboard('[Space][ArrowLeft][Space]');
  expect(data()).toEqual({ Tags: ['beta', 'alpha'] });
  screen.getByRole('button', { name: 'Move up / Move down: beta' }).focus();
  await user.keyboard('[Space][ArrowRight][Escape]');
  expect(data()).toEqual({ Tags: ['beta', 'alpha'] });
  await user.click(screen.getByRole('button', { name: 'Remove alpha' }));
  expect(data()).toEqual({ Tags: ['beta'] });
  await user.click(screen.getByRole('combobox', { name: 'Tags' }));
  await user.click(await screen.findByRole('option', { name: 'gamma' }));
  expect(data()).toEqual({ Tags: ['beta', 'gamma'] });
});
