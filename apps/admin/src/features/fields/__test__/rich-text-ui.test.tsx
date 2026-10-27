import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Harness, node, rowA, services } from './support';
import type { CodeEditorProps } from '@new-cms/ui/forms';
import type * as FormExports from '@new-cms/ui/forms';
import type { ReactElement } from 'react';
import type { FieldData } from '../types';
import type { RichTestControls } from './rich-text-visual-support';
import { RichTextVisualHarness } from './rich-text-visual-support';

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

const paragraph = {
  version: 1,
  children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hello' }] }],
};

describe('rich text visual and structure editing', () => {
  it('loads visual editing for rich text only and keeps literal HTML escaped', async () => {
    render(
      <Harness
        layout={[node('Body', { type: 'richText' })]}
        initial={{
          Body: {
            version: 1,
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }],
              },
            ],
          },
        }}
      />,
    );
    expect(await screen.findByRole('textbox', { name: 'Body' })).toHaveAttribute(
      'contenteditable',
      'true',
    );
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.queryByLabelText('Node type')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Structure editor' }));
    expect(screen.getByLabelText('Body')).toBeInstanceOf(HTMLTextAreaElement);
    fireEvent.change(screen.getByLabelText('Body'), {
      target: { value: JSON.stringify(paragraph) },
    });
    expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
      Body: paragraph,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Visual editor' }));
    expect(await screen.findByRole('textbox', { name: 'Body' })).toHaveAttribute(
      'contenteditable',
      'true',
    );
  });
  it('blocks switching away from invalid structure instead of silently saving the previous parsed value', async () => {
    render(<Harness layout={[node('Body', { type: 'richText' })]} initial={{ Body: paragraph }} />);
    await screen.findByRole('toolbar');
    fireEvent.click(screen.getByRole('button', { name: 'Structure editor' }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: '{broken' } });
    expect(screen.getByRole('button', { name: 'Visual editor' })).toBeDisabled();
    expect(screen.getByLabelText('Body')).toHaveValue('{broken');
    expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
      Body: paragraph,
    });
    expect(JSON.parse(screen.getByLabelText('Invalid').textContent ?? '{}')).toMatchObject({
      'fields/Body': expect.any(String) as unknown,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByLabelText('Body')).toHaveValue('{broken');
    fireEvent.change(screen.getByLabelText('Body'), {
      target: { value: JSON.stringify(paragraph) },
    });
    expect(screen.getByRole('button', { name: 'Visual editor' })).toBeEnabled();
    expect(JSON.parse(screen.getByLabelText('Invalid').textContent ?? '{}')).toEqual({});
  });
  it('preserves entire custom and noncanonical trees in structure editing and adds explicit nodes', async () => {
    const original = {
      version: 1,
      children: [
        { type: 'callout', version: '2', payload: { nested: true } },
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'A' },
            { type: 'text', text: 'B' },
          ],
        },
      ],
    };
    render(
      <Harness
        layout={[node('Body', { type: 'richText' })]}
        initial={{ Body: original }}
        richTextNodes={[{ type: 'callout', version: '2' }]}
      />,
    );
    expect(await screen.findByText(/Structure editing preserves every node/)).toBeVisible();
    expect(
      JSON.parse(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Body' }).value),
    ).toEqual(original);
    expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
      Body: original,
    });
    fireEvent.change(screen.getByLabelText('Node type'), { target: { value: 'text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
      Body: { version: 1, children: [...original.children, { type: 'text', text: '' }] },
    });
    fireEvent.change(screen.getByLabelText('Node type'), { target: { value: 'link' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Structure editor' })).toBeDisabled();
    expect(JSON.parse(screen.getByLabelText('Invalid').textContent ?? '{}')).toMatchObject({
      'fields/Body': expect.any(String) as unknown,
    });
  });
});

describe('rich-text references and controls', () => {
  it('inserts media through the real catalog and keeps stable source paths for reference previews', async () => {
    const ports = services();
    ports.searchReferences.mockResolvedValue({
      rows: [{ collection: 'images', id: rowA, label: 'Hero' }],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    const preview = vi.fn<() => ReactElement>(() => <span>Bound media preview</span>);
    render(
      <Harness
        services={{ ...ports, renderPreview: preview }}
        contentLocale="zh-CN"
        layout={[node('Body', { type: 'richText' })]}
      />,
    );
    await screen.findByRole('toolbar');
    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByRole('combobox', { name: 'Choose collection' }),
    ).not.toBeInTheDocument();
    fireEvent.click(await within(dialog).findByRole('option', { name: 'Images: Hero' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply selection' }));
    await waitFor(() =>
      expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
        Body: {
          version: 1,
          children: [
            { type: 'paragraph', children: [{ type: 'media', collection: 'images', id: rowA }] },
          ],
        },
      }),
    );
    expect(preview).toHaveBeenCalledWith({
      reference: { collection: 'images', id: rowA },
      path: ['Body', 'children', 0, 'children', 0],
      sourcePath: 'zh-CN:Body.children.0.children.0',
    });
    expect(await screen.findByText('Bound media preview')).toBeVisible();
  });
  it('validates link URLs in a keyboard accessible dialog and supports canceling selection', async () => {
    render(<Harness layout={[node('Body', { type: 'richText' })]} initial={{ Body: paragraph }} />);
    await screen.findByRole('toolbar');
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { value: 'javascript:alert(1)' },
    });
    expect(screen.getByRole('button', { name: 'Apply selection' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { value: 'https://example.com' },
    });
    expect(screen.getByRole('button', { name: 'Apply selection' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
      Body: paragraph,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Content reference' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });
  it('keeps a rich text field readonly and renders backend AST safely', async () => {
    render(
      <Harness
        readOnly
        layout={[node('Body', { type: 'richText' })]}
        initial={{ Body: paragraph }}
      />,
    );
    expect(await screen.findByRole('textbox', { name: 'Body' })).toHaveAttribute(
      'contenteditable',
      'false',
    );
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Structure editor' }));
    expect(screen.getByLabelText('Body')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });
});

it('persists supported formatting, blocks unsafe HTML paste and releases update listeners on unmount', async () => {
  const controls: RichTestControls = { current: null };
  const onChange = vi.fn<(value: FieldData) => void>();
  const view = render(
    <RichTextVisualHarness
      onReady={(editor) => {
        controls.current = editor;
      }}
      onChange={onChange}
    />,
  );
  await waitFor(() => expect(controls.current).not.toBeNull());
  await act(async () => {
    await controls.current?.insertText('First');
  });
  expect(onChange).toHaveBeenLastCalledWith({
    version: 1,
    children: [{ type: 'paragraph', children: [{ type: 'text', text: 'First' }] }],
  });
  await act(async () => {
    await controls.current?.format();
  });
  expect(onChange).toHaveBeenLastCalledWith({
    version: 1,
    children: [{ type: 'paragraph', align: 'center', children: [{ type: 'text', text: 'First' }] }],
  });
  await act(async () => {
    await controls.current?.paste();
  });
  expect(onChange).toHaveBeenLastCalledWith({
    version: 1,
    children: [
      {
        type: 'paragraph',
        align: 'center',
        children: [
          { type: 'text', text: 'First' },
          { type: 'text', text: '<script>safe text</script>', format: ['bold', 'italic'] },
        ],
      },
    ],
  });
  expect(document.querySelector('script')).toBeNull();
  view.unmount();
  onChange.mockClear();
  await act(async () => {
    await controls.current?.insertText('After unmount');
  });
  expect(onChange).not.toHaveBeenCalled();
});

it('persists default headings and bullet lists from toolbar controls', async () => {
  render(<Harness layout={[node('Body', { type: 'richText' })]} initial={{ Body: paragraph }} />);
  await screen.findByRole('toolbar');
  const heading = screen.getByRole('button', { name: 'Heading' });
  fireEvent.mouseDown(heading);
  fireEvent.click(heading);
  await waitFor(() =>
    expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
      Body: {
        version: 1,
        children: [{ type: 'heading', children: [{ type: 'text', text: 'Hello' }] }],
      },
    }),
  );
  fireEvent.mouseDown(screen.getByRole('button', { name: 'Paragraph' }));
  fireEvent.click(screen.getByRole('button', { name: 'Paragraph' }));
  await waitFor(() =>
    expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
      Body: paragraph,
    }),
  );
  fireEvent.mouseDown(screen.getByRole('button', { name: 'List' }));
  fireEvent.click(screen.getByRole('button', { name: 'List' }));
  await waitFor(() =>
    expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
      Body: {
        version: 1,
        children: [
          {
            type: 'list',
            children: [{ type: 'listItem', children: [{ type: 'text', text: 'Hello' }] }],
          },
        ],
      },
    }),
  );
});

it('keeps pasted line breaks and soft returns lossless in the visual editor', async () => {
  const controls: RichTestControls = { current: null };
  const onChange = vi.fn<(value: FieldData) => void>();
  render(
    <RichTextVisualHarness
      onReady={(editor) => {
        controls.current = editor;
      }}
      onChange={onChange}
    />,
  );
  await waitFor(() => expect(controls.current).not.toBeNull());
  await act(async () => {
    await controls.current?.insertText('First');
  });
  await act(async () => {
    await controls.current?.paste('\nSecond\tpart');
  });
  await act(async () => {
    await controls.current?.softBreak();
  });
  expect(onChange).toHaveBeenLastCalledWith({
    version: 1,
    children: [{ type: 'paragraph', children: [{ type: 'text', text: 'First\nSecond\tpart\n' }] }],
  });
});
