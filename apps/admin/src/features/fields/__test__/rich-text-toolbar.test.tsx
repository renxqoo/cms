import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Harness, node, rowA, services } from './support';

const paragraph = {
  version: 1,
  children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Story' }] }],
};

function data() {
  return JSON.parse(screen.getByLabelText('Data').textContent ?? '{}') as unknown;
}

it('keeps visual editing after persisted text node keys return in a different order', async () => {
  render(
    <Harness
      layout={[node('Body', { type: 'richText' })]}
      initial={{
        Body: {
          version: 1,
          children: [{ type: 'paragraph', children: [{ text: 'Saved story', type: 'text' }] }],
        },
      }}
    />,
  );
  expect(await screen.findByRole('textbox', { name: 'Body' })).toHaveAttribute(
    'contenteditable',
    'true',
  );
  expect(screen.queryByText(/Structure editing preserves every node/)).not.toBeInTheDocument();
  expect(screen.getByRole('toolbar')).toBeVisible();
  expect(screen.getByText('Saved story')).toBeVisible();
});

it('shows the current block format and restores saved content through undo and redo', async () => {
  render(<Harness layout={[node('Body', { type: 'richText' })]} initial={{ Body: paragraph }} />);
  await screen.findByRole('toolbar');
  const undo = screen.getByRole('button', { name: 'Undo' });
  const redo = screen.getByRole('button', { name: 'Redo' });
  expect(undo).toBeDisabled();
  expect(redo).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Heading' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Heading' })).toBePressed());
  expect(screen.getByRole('button', { name: 'Paragraph' })).not.toBePressed();
  expect(screen.getByRole('heading', { name: 'Story' })).toBeVisible();
  await waitFor(() => expect(undo).toBeEnabled());
  fireEvent.click(undo);
  await waitFor(() => expect(data()).toEqual({ Body: paragraph }));
  expect(screen.queryByRole('heading', { name: 'Story' })).not.toBeInTheDocument();
  expect(undo).toBeDisabled();
  expect(redo).toBeEnabled();
  fireEvent.click(redo);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Heading' })).toBePressed());
  expect(data()).toEqual({
    Body: {
      version: 1,
      children: [{ type: 'heading', children: [{ type: 'text', text: 'Story' }] }],
    },
  });
  expect(redo).toBeDisabled();
});

it('regression: list toggling restores paragraph content and its active toolbar state', async () => {
  render(<Harness layout={[node('Body', { type: 'richText' })]} initial={{ Body: paragraph }} />);
  await screen.findByRole('toolbar');
  const list = screen.getByRole('button', { name: 'List' });
  await userEvent.click(list);
  await waitFor(() => expect(list, 'List insertion selects the list toolbar action').toBePressed());
  expect(screen.getByRole('listitem')).toHaveTextContent('Story');
  await userEvent.click(list);
  await waitFor(() =>
    expect(list, 'List removal clears the list toolbar action').not.toBePressed(),
  );
  expect(data()).toEqual({ Body: paragraph });
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Paragraph' }),
      'List removal selects the paragraph toolbar action',
    ).toBePressed(),
  );
});

it('provides Chinese labels and a writing prompt for an empty editor', async () => {
  render(<Harness language="zh" layout={[node('正文', { type: 'richText' })]} />);
  await screen.findByRole('toolbar', { name: '富文本' });
  expect(screen.getByRole('textbox', { name: '正文' })).toHaveAttribute('aria-multiline', 'true');
  expect(screen.getByRole('textbox', { name: '正文' })).toHaveAttribute(
    'aria-placeholder',
    '输入正文…',
  );
  expect(screen.getByText('输入正文…')).toBeVisible();
  expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '重做' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '结构编辑' })).toBeEnabled();
});

it('internal document links and relationship nodes use their own eligible collections and preserve existing references', async () => {
  const ports = services();
  ports.searchReferences.mockResolvedValue({
    rows: [{ collection: 'pages', id: rowA, label: 'Allowed target' }],
    total: 1,
    page: 1,
    pageSize: 10,
  });
  render(
    <Harness
      services={{
        ...ports,
        collections: [
          { id: 'pages', label: 'Pages', richTextLink: true, richTextRelationship: false },
          { id: 'articles', label: 'Articles', richTextLink: false, richTextRelationship: true },
          {
            id: 'images',
            label: 'Images',
            upload: true,
            richTextLink: false,
            richTextRelationship: false,
          },
        ],
      }}
      layout={[node('Body', { type: 'richText' })]}
    />,
  );
  await screen.findByRole('toolbar');
  fireEvent.click(screen.getByRole('button', { name: 'Internal document link' }));
  expect(screen.queryByRole('combobox', { name: 'Choose collection' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('option', { name: 'Pages: Allowed target' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply selection' }));
  await waitFor(() =>
    expect(data()).toEqual({
      Body: {
        version: 1,
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                reference: { collection: 'pages', id: rowA },
                children: [{ type: 'text', text: `Pages / ${rowA}` }],
              },
            ],
          },
        ],
      },
    }),
  );
  expect(ports.searchReferences.mock.calls[0]?.[0]).toMatchObject({
    collections: ['pages'],
    collection: 'pages',
    context: 'admin',
  });
  ports.searchReferences.mockResolvedValue({
    rows: [{ collection: 'articles', id: rowA, label: 'Related target' }],
    total: 1,
    page: 1,
    pageSize: 10,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Content reference' }));
  await screen.findByRole('option', { name: 'Articles: Related target' });
  expect(screen.queryByRole('combobox', { name: 'Choose collection' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(data()).toMatchObject({
    Body: {
      children: [{ children: [{ type: 'link', reference: { collection: 'pages', id: rowA } }] }],
    },
  });
});
