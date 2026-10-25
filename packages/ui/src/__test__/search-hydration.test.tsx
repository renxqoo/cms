import { act, fireEvent, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { SearchBar } from '../forms.tsx';

function SearchExample({
  search,
  initial = '',
}: {
  search: (value: string) => void;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SearchBar
      value={value}
      onValueChange={setValue}
      onSearch={search}
      mode={{ type: 'submit' }}
      label="Search content"
      searchLabel="Search"
      clearLabel="Clear search"
      placeholder="Title"
    />
  );
}

it('regression: search submits text entered before hydration instead of the stale server value', async () => {
  const search = vi.fn<(value: string) => void>();
  const container = document.createElement('div');
  document.body.append(container);
  container.innerHTML = renderToString(<SearchExample search={search} />);
  const input = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search content' });
  input.value = 'OneAster';
  const root = hydrateRoot(container, <SearchExample search={search} />);
  try {
    await act(async () => {
      await Promise.resolve();
    });
    expect(input).toHaveValue('OneAster');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(search).toHaveBeenCalledExactlyOnceWith('OneAster');
    expect(input).toHaveValue('OneAster');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(search).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search.mock.calls).toEqual([['OneAster'], ['']]);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it.each(['replacement draft', ''])(
  'regression: hydrated search submits a pre-hydration edit of an existing query: %s',
  async (edited) => {
    const search = vi.fn<(value: string) => void>();
    const container = document.createElement('div');
    document.body.append(container);
    container.innerHTML = renderToString(
      <SearchExample search={search} initial="original query" />,
    );
    const input = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search content' });
    input.value = edited;
    const root = hydrateRoot(container, <SearchExample search={search} initial="original query" />);
    try {
      await act(async () => {
        await Promise.resolve();
      });
      fireEvent.submit(screen.getByRole('search'));
      expect(search).toHaveBeenCalledExactlyOnceWith(edited);
      expect(input).toHaveValue(edited);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  },
);
