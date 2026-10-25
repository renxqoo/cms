import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileIcon } from 'lucide-react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import {
  BooleanCell,
  ColumnSelector,
  DateCell,
  NumberCell,
  RelationshipCell,
  SortSelect,
  StatusCell,
  TextCell,
  Thumbnail,
} from '../data.tsx';
import type { DataTableSort } from '../data.tsx';
import { AnimateHeight, Card, Collapsible } from '../layout.tsx';
import { Breadcrumbs, Icon, Link, StepNavigation, StepNavigationProvider } from '../navigation.tsx';
import { Pill } from '../feedback.tsx';

it('renders typed table values with explicit empty and malformed date feedback', () => {
  const view = render(
    <>
      <TextCell value="Document title" emptyLabel="Empty text" />
      <BooleanCell value={false} trueLabel="Yes" falseLabel="No" emptyLabel="Unknown" />
      <NumberCell value={12.5} format={(value) => `$${value.toFixed(2)}`} emptyLabel="No amount" />
      <DateCell
        value="2026-10-26T10:00:00.000Z"
        format={() => '26 October 2026'}
        emptyLabel="No date"
        errorLabel="Invalid date"
      />
      <StatusCell tone="success">Published</StatusCell>
      <RelationshipCell label="About page" href="/pages/about" emptyLabel="No relation" />
    </>,
  );
  expect(screen.getByText('Document title')).toBeVisible();
  expect(screen.getByText('No')).toBeVisible();
  expect(screen.getByText('$12.50')).toBeVisible();
  expect(screen.getByText('26 October 2026')).toHaveAttribute(
    'datetime',
    '2026-10-26T10:00:00.000Z',
  );
  expect(screen.getByRole('link', { name: 'About page' })).toHaveAttribute('href', '/pages/about');
  expect(screen.getByText('Published')).toBeVisible();
  view.rerender(
    <>
      <TextCell value="" emptyLabel="Empty text" />
      <BooleanCell value={null} trueLabel="Yes" falseLabel="No" emptyLabel="Unknown" />
      <NumberCell value={Number.NaN} format={(value) => String(value)} emptyLabel="No amount" />
      <DateCell
        value="invalid"
        format={() => 'Date'}
        emptyLabel="No date"
        errorLabel="Invalid date"
      />
      <RelationshipCell label={null} emptyLabel="No relation" />
    </>,
  );
  expect(screen.getByText('Empty text')).toBeVisible();
  expect(screen.getByText('Unknown')).toBeVisible();
  expect(screen.getByText('No amount')).toBeVisible();
  expect(screen.getByText('Invalid date')).toBeVisible();
  expect(screen.getByText('No relation')).toBeVisible();
  view.rerender(
    <>
      <TextCell value={null} emptyLabel="No text" />
      <BooleanCell value trueLabel="Yes" falseLabel="No" emptyLabel="Unknown" />
      <DateCell value={null} format={() => 'Date'} emptyLabel="No date" errorLabel="Invalid date" />
      <RelationshipCell label="Unavailable target" emptyLabel="No relation" />
    </>,
  );
  expect(screen.getByText('No date')).toBeVisible();
  expect(screen.getByText('No text')).toBeVisible();
  expect(screen.getByText('Yes')).toBeVisible();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

it('keeps thumbnails on a new source after a previous image fails', () => {
  const props = {
    alt: 'Image preview',
    filename: 'cover.png',
    fallbackLabel: 'Image unavailable',
    mimeType: 'image/png',
  };
  const view = render(<Thumbnail {...props} src="blob:http://localhost/preview-one" />);
  expect(screen.getByRole('img', { name: 'Image preview' })).toHaveAttribute(
    'src',
    'blob:http://localhost/preview-one',
  );
  fireEvent.error(screen.getByRole('img', { name: 'Image preview' }));
  expect(screen.getByRole('img', { name: 'Image unavailable' })).toBeVisible();
  view.rerender(<Thumbnail {...props} src="/another.png" />);
  expect(screen.getByRole('img', { name: 'Image preview' })).toHaveAttribute('src', '/another.png');
});

it.each([
  'video/mp4',
  'audio/mpeg',
  'text/plain',
  'application/pdf',
  'application/zip',
  'application/x-compressed',
  undefined,
])('provides a file fallback for %s without unsafe image requests', (mimeType) => {
  render(
    <Thumbnail
      src="javascript:alert(1)"
      alt="Preview"
      filename="document"
      fallbackLabel="File preview"
      {...(mimeType ? { mimeType } : {})}
    />,
  );
  expect(screen.getByRole('img', { name: 'File preview' })).toBeVisible();
  expect(document.querySelector('img')).toBeNull();
});

function SortingControls() {
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [columns, setColumns] = useState<string[]>(['id', 'name']);
  return (
    <>
      <SortSelect
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'date', label: 'Date' },
        ]}
        value={sort}
        onChange={setSort}
        labels={{
          label: 'Sort field',
          noneLabel: 'Default order',
          ascendingLabel: 'Ascending',
          descendingLabel: 'Descending',
        }}
      />
      <span aria-label="Current sort">{sort ? `${sort.key}:${sort.direction}` : 'default'}</span>
      <ColumnSelector
        label="Columns"
        columns={[
          { key: 'id', label: 'Identifier', locked: true },
          { key: 'name', label: 'Name' },
          { key: 'date', label: 'Date' },
        ]}
        selectedKeys={columns}
        onChange={setColumns}
      />
      <span aria-label="Visible columns">{columns.join(',')}</span>
    </>
  );
}

it('changes list order and column visibility through controlled events', async () => {
  const user = userEvent.setup();
  render(<SortingControls />);
  expect(screen.getByRole('combobox', { name: 'Ascending / Descending' })).toBeDisabled();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort field' }), 'name');
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Ascending / Descending' }),
    'desc',
  );
  expect(screen.getByLabelText('Current sort')).toHaveTextContent('name:desc');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort field' }), '');
  expect(screen.getByLabelText('Current sort')).toHaveTextContent('default');
  await user.click(screen.getByRole('button', { name: 'Columns' }));
  await user.click(screen.getByRole('checkbox', { name: 'Name' }));
  await user.click(screen.getByRole('checkbox', { name: 'Date' }));
  expect(screen.getByLabelText('Visible columns')).toHaveTextContent('id,date');
  expect(screen.getByRole('checkbox', { name: 'Identifier' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

it.each([
  'javascript:alert(1)',
  'java\nscript:alert(1)',
  'data:text/html,hello',
  'vbscript:msgbox(1)',
  '   ',
])('disables unsafe navigation %s', (href) => {
  render(<Link href={href}>Unsafe destination</Link>);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText('Unsafe destination')).toHaveAttribute('aria-disabled', 'true');
});

it('preserves native link semantics and protects new-tab destinations', () => {
  const view = render(
    <>
      <Link href="https://example.com" target="_blank" rel="nofollow">
        External docs
      </Link>
      <Link href="mailto:editor@example.com">Email editor</Link>
      <Card render={<a href="/ui/lists" />}>Open documents</Card>
    </>,
  );
  expect(screen.getByRole('link', { name: 'External docs' })).toHaveAttribute(
    'rel',
    'nofollow noopener noreferrer',
  );
  expect(screen.getByRole('link', { name: 'Email editor' })).toHaveAttribute(
    'href',
    'mailto:editor@example.com',
  );
  expect(screen.getByRole('link', { name: 'Open documents' })).toHaveAttribute('href', '/ui/lists');
  view.rerender(<Link href="/ui">Workspace</Link>);
  expect(screen.getByRole('link', { name: 'Workspace' })).not.toHaveAttribute('target');
});

it('lets breadcrumbs use the application navigation adapter while the last item stays plain text', () => {
  render(
    <Breadcrumbs
      label="Navigation"
      items={[
        { id: 'empty', label: 'Section' },
        { id: 'home', label: 'Home', href: '/ui' },
        { id: 'current', label: 'Current', href: '/ui/lists' },
      ]}
      renderLink={(item) =>
        item.href ? (
          <a href={item.href} data-testid={`app-${item.id}`}>
            {item.label}
          </a>
        ) : (
          <span>{item.label}</span>
        )
      }
    />,
  );
  expect(screen.getByTestId('app-home')).toHaveAttribute('href', '/ui');
  expect(screen.getByText('Current')).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('link', { name: 'Current' })).not.toBeInTheDocument();
});

it('registers current step navigation and clears it when the view unmounts', async () => {
  const view = render(
    <StepNavigationProvider label="Navigation" fallback={<span>OneAster</span>}>
      <span>View content</span>
    </StepNavigationProvider>,
  );
  expect(screen.getByText('OneAster')).toBeVisible();
  view.rerender(
    <StepNavigationProvider label="Navigation" fallback={<span>OneAster</span>}>
      <StepNavigation
        items={[
          { id: 'root', label: 'Workspace', href: '/ui' },
          { id: 'document', label: 'Draft one' },
        ]}
      />
    </StepNavigationProvider>,
  );
  expect(await screen.findByText('Draft one')).toHaveAttribute('aria-current', 'page');
  view.rerender(
    <StepNavigationProvider label="Navigation" fallback={<span>OneAster</span>}>
      <StepNavigation items={[{ id: 'next', label: 'Published page' }]} />
    </StepNavigationProvider>,
  );
  expect(await screen.findByText('Published page')).toBeVisible();
  expect(screen.queryByText('Draft one')).not.toBeInTheDocument();
  view.rerender(
    <StepNavigationProvider label="Navigation" fallback={<span>OneAster</span>}>
      {null}
    </StepNavigationProvider>,
  );
  await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeInTheDocument());
  expect(screen.getByText('OneAster')).toBeVisible();
});

it('distinguishes labelled icons from decorative icons and supports pill removal', async () => {
  const remove = vi.fn<() => void>();
  const view = render(
    <>
      <Icon icon={FileIcon} label="File" size="sm" />
      <Icon icon={FileIcon} />
      <Pill removeLabel="Remove selected" onRemove={remove}>
        Selected
      </Pill>
    </>,
  );
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(screen.getByRole('img', { name: 'File' })).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Remove selected' }));
  expect(remove).toHaveBeenCalledOnce();
  view.rerender(<Icon icon={FileIcon} label="Large file" size="lg" />);
  expect(screen.getByRole('img', { name: 'Large file' })).toBeVisible();
});

function CollapsibleExample() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} title="Advanced settings">
      <InputContent />
    </Collapsible>
  );
}

function InputContent() {
  return <p>Visible settings</p>;
}

it('opens and closes expandable sections with keyboard activation', async () => {
  const user = userEvent.setup();
  render(<CollapsibleExample />);
  const trigger = screen.getByRole('button', { name: 'Advanced settings' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  trigger.focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByText('Visible settings')).toBeVisible();
  await user.keyboard('{Enter}');
  await waitFor(() => expect(screen.queryByText('Visible settings')).not.toBeInTheDocument());
});

it('releases height observers and motion listeners when animated content unmounts', () => {
  const originalObserver = globalThis.ResizeObserver;
  const originalMatchMedia = globalThis.matchMedia;
  const disconnect = vi.fn<() => void>();
  const observe = vi.fn<(node: Element) => void>();
  let resize: (() => void) | undefined;
  class TestObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resize = () => callback([], this);
    }
    observe = observe;
    disconnect = disconnect;
    unobserve(): void {}
  }
  const target = new EventTarget();
  const media = {
    matches: false,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: vi.fn<EventTarget['removeEventListener']>(
      target.removeEventListener.bind(target),
    ),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  const bounds = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, 100, 40));
  vi.stubGlobal('ResizeObserver', TestObserver);
  vi.stubGlobal('matchMedia', () => media);
  const view = render(
    <AnimateHeight durationMs={200}>
      <p>Content</p>
    </AnimateHeight>,
  );
  expect(observe).toHaveBeenCalledOnce();
  expect(screen.getByText('Content').parentElement?.parentElement).toHaveStyle({ height: '40px' });
  bounds.mockReturnValue(new DOMRect(0, 0, 100, 80));
  act(() => {
    resize?.();
    media.matches = true;
    media.dispatchEvent(new Event('change'));
  });
  expect(screen.getByText('Content').parentElement?.parentElement).toHaveStyle({
    height: '80px',
    transitionDuration: '0ms',
  });
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(media.removeEventListener).toHaveBeenCalledOnce();
  bounds.mockRestore();
  vi.stubGlobal('ResizeObserver', originalObserver);
  vi.stubGlobal('matchMedia', originalMatchMedia);
});
