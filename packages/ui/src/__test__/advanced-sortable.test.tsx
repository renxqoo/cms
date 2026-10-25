import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { SortableList } from '../data/sortable-list.tsx';
import type { SortableLabels } from '../data/sortable-list.tsx';

const labels: SortableLabels = {
  listLabel: 'Ordered sections',
  roleDescription: 'Reorderable section',
  invalidItemsLabel: 'Section identifiers must be unique and nonempty',
  handleLabel: (label) => `Move ${label}`,
  instructions: 'Space to lift, arrows to move, space to drop, Escape to cancel.',
  start: (label) => `Lifted ${label}`,
  move: (label, position, total) => `${label} at ${position} of ${total}`,
  end: (label, position, total) => `Dropped ${label} at ${position} of ${total}`,
  cancel: (label) => `Canceled ${label}`,
};

afterEach(() => vi.restoreAllMocks());

function item(value: string, handle: React.ReactNode) {
  return (
    <div>
      {handle}
      {value}
    </div>
  );
}

function Harness({ onChange }: { onChange: (items: string[]) => void }) {
  const [items, setItems] = useState(['Alpha', 'Bravo', 'Charlie']);
  return (
    <SortableList
      items={items}
      getId={(value) => value}
      getItemLabel={(value) => value}
      renderItem={item}
      labels={labels}
      onChange={(next) => {
        setItems(next);
        onChange(next);
      }}
    />
  );
}

function measuredRows() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const rows = [...document.querySelectorAll('[role="listitem"]')];
    const position = rows.indexOf(this);
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

it('reorders actual sections by keyboard and announces the resulting order', async () => {
  measuredRows();
  const onChange = vi.fn<(items: string[]) => void>();
  const user = userEvent.setup();
  render(<Harness onChange={onChange} />);
  screen.getByRole('button', { name: 'Move Alpha' }).focus();
  await user.keyboard('[Space]');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Move Alpha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  );
  await user.keyboard('[ArrowDown]');
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Alpha at 2 of 3'));
  await user.keyboard('[Space]');
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(['Bravo', 'Alpha', 'Charlie']));
  expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
    'Bravo',
    'Alpha',
    'Charlie',
  ]);
});

it('cancels a keyboard drag without applying an order', async () => {
  measuredRows();
  const onChange = vi.fn<(items: string[]) => void>();
  const user = userEvent.setup();
  render(<Harness onChange={onChange} />);
  screen.getByRole('button', { name: 'Move Alpha' }).focus();
  await user.keyboard('[Space]');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Move Alpha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  );
  await user.keyboard('[Escape]');
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
    'Alpha',
    'Bravo',
    'Charlie',
  ]);
});

it('does not emit changes for a drop at the original location', async () => {
  measuredRows();
  const onChange = vi.fn<(items: string[]) => void>();
  const user = userEvent.setup();
  render(<Harness onChange={onChange} />);
  screen.getByRole('button', { name: 'Move Alpha' }).focus();
  await user.keyboard('[Space]');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Move Alpha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  );
  await user.keyboard('[Space]');
  expect(onChange).not.toHaveBeenCalled();
});

it('disables sorting for the full control or individual sections', () => {
  const onChange = vi.fn<(items: string[]) => void>();
  const { rerender } = render(
    <SortableList
      items={['Alpha', 'Bravo']}
      getId={String}
      getItemLabel={String}
      renderItem={item}
      labels={labels}
      onChange={onChange}
      disabled
    />,
  );
  expect(screen.getByRole('button', { name: 'Move Alpha' })).toBeDisabled();
  rerender(
    <SortableList
      items={['Alpha', 'Bravo']}
      getId={String}
      getItemLabel={String}
      renderItem={item}
      labels={labels}
      onChange={onChange}
      isItemDisabled={(value) => value === 'Bravo'}
      orientation="horizontal"
    />,
  );
  expect(screen.getByRole('button', { name: 'Move Alpha' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Move Bravo' })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Move Bravo' }), {
    key: ' ',
    code: 'Space',
  });
  expect(onChange).not.toHaveBeenCalled();
});

it.each([{ items: ['same', 'same'] }, { items: [''] }])(
  'reports ambiguous or empty identifiers instead of sorting the wrong section',
  ({ items }) => {
    render(
      <SortableList
        items={items}
        getId={String}
        getItemLabel={String}
        renderItem={item}
        labels={labels}
        onChange={vi.fn<(items: string[]) => void>()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Section identifiers must be unique and nonempty',
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  },
);

it('regression: the sortable role description follows the injected locale instead of vendor English', () => {
  const { rerender } = render(
    <SortableList
      items={['Alpha']}
      getId={String}
      getItemLabel={String}
      renderItem={item}
      labels={{ ...labels, roleDescription: '可排序项目' }}
      onChange={vi.fn<(items: string[]) => void>()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Move Alpha' })).toHaveAttribute(
    'aria-roledescription',
    '可排序项目',
  );
  rerender(
    <SortableList
      items={['Alpha']}
      getId={String}
      getItemLabel={String}
      renderItem={item}
      labels={labels}
      onChange={vi.fn<(items: string[]) => void>()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Move Alpha' })).toHaveAttribute(
    'aria-roledescription',
    'Reorderable section',
  );
});

it('regression: releasing a pointer outside every sortable row cancels without reordering', async () => {
  measuredRows();
  const user = userEvent.setup();
  const onChange = vi.fn<(items: string[]) => void>();
  render(<Harness onChange={onChange} />);
  const handle = screen.getByRole('button', { name: 'Move Alpha' });
  await user.pointer([
    { keys: '[MouseLeft>]', target: handle, coords: { x: 10, y: 20 } },
    { target: document.body, coords: { x: 1000, y: 1000 } },
  ]);
  await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
  await user.pointer({ keys: '[/MouseLeft]', target: document.body, coords: { x: 1000, y: 1000 } });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
    'Alpha',
    'Bravo',
    'Charlie',
  ]);
});
