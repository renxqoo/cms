import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Harness, node } from './support';

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

it('toggles a bullet list back to a paragraph without losing its text', async () => {
  render(<Harness layout={[node('Body', { type: 'richText' })]} initial={{ Body: paragraph }} />);
  await screen.findByRole('toolbar');
  const list = screen.getByRole('button', { name: 'List' });
  fireEvent.click(list);
  await waitFor(() => expect(list).toBePressed());
  expect(screen.getByRole('listitem')).toHaveTextContent('Story');
  fireEvent.click(list);
  await waitFor(() => expect(list).not.toBePressed());
  expect(data()).toEqual({ Body: paragraph });
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Paragraph' })).toBePressed();
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
