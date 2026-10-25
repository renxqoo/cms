import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CmsShowcase } from '../../../features/ui-lab/cms-showcase';
import type { NavigationAdapter, NavigationAttempt } from '../../shell/navigation/types';

beforeEach(() => {
  let sequence = 0;
  class LocalURL extends URL {
    static override createObjectURL = vi.fn<(blob: Blob | MediaSource) => string>(
      () => `blob:example-${++sequence}`,
    );
    static override revokeObjectURL = vi.fn<(url: string) => void>();
  }
  vi.stubGlobal('URL', LocalURL);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fixture(locale = 'en') {
  let listener: ((attempt: NavigationAttempt) => void) | null = null;
  let sequence = 0;
  const commit = vi.fn<NavigationAdapter['commit']>();
  const cancel = vi.fn<NavigationAdapter['cancel']>();
  const navigation: NavigationAdapter = {
    subscribe: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
    commit,
    cancel,
  };
  const onNavigate = vi.fn<(href: string) => void>((href) =>
    listener?.({ id: String(++sequence), href, kind: 'push' }),
  );
  const view = render(
    <NextIntlClientProvider locale={locale} messages={{}} timeZone="UTC">
      <CmsShowcase navigation={navigation} onNavigate={onNavigate} />
    </NextIntlClientProvider>,
  );
  return { ...view, navigation, onNavigate, commit, cancel };
}

it('composes local relationship selection, creation/edit events and media drawer intake', async () => {
  fixture();
  const region = within(screen.getByRole('region', { name: 'Document relationships' }));
  fireEvent.click(region.getByRole('option', { name: 'Articles: Welcome to OneAster' }));
  fireEvent.click(region.getByRole('option', { name: 'Media: Homepage cover' }));
  expect(
    region
      .getByRole('button', { name: 'Move Homepage cover' })
      .getAttribute('aria-roledescription'),
  ).toBe('Sortable item');
  fireEvent.click(region.getByRole('button', { name: 'View local example Welcome to OneAster' }));
  expect(region.getByLabelText('Latest local event').textContent).toContain('articles/1');
  fireEvent.click(region.getByRole('button', { name: 'Create local example Articles' }));
  expect(region.getByLabelText('Latest local event').textContent).toContain('articles');
  fireEvent.click(region.getByRole('button', { name: 'Choose existing documents' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Media document selection' }));
  fireEvent.click(dialog.getByRole('option', { name: 'Media: Homepage cover' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.change(region.getByLabelText('Choose files'), {
    target: { files: [new File(['a'], 'cover.png', { type: 'image/png' })] },
  });
  expect(region.getByLabelText('Latest local event').textContent).toContain('cover.png');
  fireEvent.click(region.getByRole('button', { name: 'Reset local example' }));
  expect(region.queryByRole('button', { name: 'Remove Homepage cover' })).toBeNull();
});

it('keeps a dirty title on canceled navigation and applies only explicitly local document actions', async () => {
  const view = fixture();
  const region = within(screen.getByRole('region', { name: 'Document state and actions' }));
  fireEvent.change(region.getByRole('textbox', { name: 'Title' }), {
    target: { value: 'Edited local title' },
  });
  fireEvent.click(region.getByRole('button', { name: 'Go to lists' }));
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(view.cancel).toHaveBeenCalledTimes(1);
  expect(region.getByRole('textbox', { name: 'Title' })).toHaveProperty(
    'value',
    'Edited local title',
  );
  fireEvent.click(region.getByRole('checkbox', { name: 'Return an example error' }));
  fireEvent.click(region.getByRole('button', { name: 'Apply local draft' }));
  await waitFor(() =>
    expect(
      region
        .getAllByRole('alert')
        .some((alert) => alert.textContent?.includes('Local example action failed')),
    ).toBe(true),
  );
  fireEvent.click(region.getByRole('checkbox', { name: 'Return an example error' }));
  fireEvent.click(region.getByRole('button', { name: 'Apply local draft' }));
  await waitFor(() =>
    expect(region.getByRole('button', { name: 'Apply local draft' })).toHaveProperty(
      'disabled',
      true,
    ),
  );
  fireEvent.click(region.getByRole('button', { name: 'Set local published state' }));
  await waitFor(() =>
    expect(region.getByRole('button', { name: 'Return to local draft' })).toBeTruthy(),
  );
  fireEvent.click(region.getByRole('button', { name: 'Return to local draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm local action' }));
  await waitFor(() =>
    expect(region.queryByRole('button', { name: 'Return to local draft' })).toBeNull(),
  );
  fireEvent.click(region.getByRole('button', { name: 'Clear local title' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm local action' }));
  await waitFor(() =>
    expect(region.getByRole('textbox', { name: 'Title' })).toHaveProperty('value', ''),
  );
  fireEvent.click(region.getByRole('button', { name: 'Reset local example' }));
  expect(region.getByRole('textbox', { name: 'Title' })).toHaveProperty('value', 'OneAster draft');
});

it('demonstrates controlled lock events, restoration failure and item-level local batch validation', async () => {
  fixture();
  const region = within(screen.getByRole('region', { name: 'Document state and actions' }));
  fireEvent.click(region.getByRole('button', { name: 'Request takeover' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(region.queryByRole('button', { name: 'Request takeover' })).toBeNull(),
  );
  fireEvent.click(region.getByRole('checkbox', { name: 'Return an example error' }));
  fireEvent.click(region.getByRole('button', { name: 'View restore event' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(screen.getByRole('dialog').textContent).toContain('Local state event failed'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(region.getByRole('button', { name: 'Validate local batch results' }));
  await waitFor(() =>
    expect(region.getByText('Welcome to OneAster: Local validation passed')).toBeTruthy(),
  );
  expect(region.getByText('Homepage cover: Local example validation failed')).toBeTruthy();
});

it('previews real local file bytes and exposes synthetic progress without claiming transmission', () => {
  fixture();
  const region = within(screen.getByRole('region', { name: 'File editing' }));
  const file = new File(['one'], 'one.png', { type: 'image/png' });
  fireEvent.change(region.getByLabelText('Choose files'), { target: { files: [file] } });
  expect(region.getByText('Local queue, not sent')).toBeTruthy();
  fireEvent.click(region.getByRole('button', { name: 'Show synthetic progress state' }));
  expect(region.getByRole('progressbar', { name: 'Progress one.png' })).toHaveProperty('value', 45);
  fireEvent.click(region.getByRole('button', { name: 'Cancel one.png' }));
  fireEvent.click(region.getByRole('button', { name: 'Retry event one.png' }));
  fireEvent.change(region.getByLabelText('Replace one.png'), {
    target: { files: [new File(['two'], 'two.png', { type: 'image/png' })] },
  });
  expect(region.getByText('two.png')).toBeTruthy();
  fireEvent.click(region.getByRole('button', { name: 'Remove two.png' }));
  expect(region.queryByText('two.png')).toBeNull();
  fireEvent.change(region.getByLabelText('Choose files'), {
    target: { files: [new File(['x'], 'bad.exe', { type: 'application/octet-stream' })] },
  });
  expect(region.getByLabelText('Latest local event').textContent).toContain(
    'Unsupported file type',
  );
  fireEvent.change(region.getByLabelText('Remote file URL'), {
    target: { value: 'https://example.com/media.png' },
  });
  fireEvent.click(region.getByRole('button', { name: 'Record URL event' }));
  expect(region.getByLabelText('Latest local event').textContent).toContain(
    'https://example.com/media.png',
  );
  fireEvent.click(region.getByRole('button', { name: 'Reset local example' }));
  expect(region.queryByLabelText('Latest local event')).toBeNull();
});

it('compares actual local SVG sizes and outputs independently checkable crop dimensions', () => {
  fixture();
  const region = within(screen.getByRole('region', { name: 'Image sizes and adjustments' }));
  fireEvent.change(region.getByRole('combobox', { name: 'Preview size' }), {
    target: { value: 'thumbnail' },
  });
  expect(region.getByText('320 × 240')).toBeTruthy();
  fireEvent.change(region.getByRole('combobox', { name: 'Preview size' }), {
    target: { value: 'square' },
  });
  expect(region.getByText('240 × 240')).toBeTruthy();
  fireEvent.change(region.getByLabelText('Crop X'), { target: { value: '0.1' } });
  fireEvent.click(region.getByRole('button', { name: 'Output local adjustment parameters' }));
  expect(region.getByLabelText('Local image adjustment parameters').textContent).toContain(
    '"pixelWidth": 400',
  );
  expect(region.getByLabelText('Local image adjustment parameters').textContent).toContain(
    '"pixelHeight": 300',
  );
});

it('renders Chinese labels and aggregates image edits into the same navigation guard', () => {
  const view = fixture('zh');
  expect(screen.getByRole('heading', { name: '文档、关系与媒体' })).toBeTruthy();
  const related = within(screen.getByRole('region', { name: '文档关联' }));
  fireEvent.click(related.getByRole('option', { name: '文章: 欢迎使用 OneAster' }));
  fireEvent.click(related.getByRole('option', { name: '媒体: 首页封面' }));
  expect(
    related.getByRole('button', { name: '移动 首页封面' }).getAttribute('aria-roledescription'),
  ).toBe('可排序项目');
  const image = within(screen.getByRole('region', { name: '图片尺寸与调整' }));
  fireEvent.change(image.getByLabelText('焦点 Y'), { target: { value: '0.3' } });
  act(() => view.onNavigate('/ui/lists'));
  expect(screen.getByRole('dialog', { name: '有尚未应用的本地修改' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '离开页面' }));
  expect(view.commit).toHaveBeenCalledTimes(1);
});
