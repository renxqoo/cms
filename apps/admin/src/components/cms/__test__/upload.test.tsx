import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Upload } from '../upload';
import type { UploadItem, UploadProps } from '../upload';
import { FileDetails, PreviewSizes } from '../upload-helpers';
import { getCmsMessages } from '../../../features/ui-lab/cms-messages';
import { safeResourceUrl } from '../safe-url';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const copy = getCmsMessages('en');

function fixture(items: UploadItem[] = []) {
  return {
    items,
    limits: { maxFiles: 3, maxBytes: 1024, accept: ['image/*'] },
    labels: copy.upload,
    dropzoneLabels: copy.dropzone,
    fileLabels: copy.file,
    formatBytes: copy.formatBytes,
    formatDimensions: copy.formatDimensions,
    onFiles: vi.fn<UploadProps['onFiles']>(),
    onReject: vi.fn<UploadProps['onReject']>(),
    onRemoteUrl: vi.fn<UploadProps['onRemoteUrl']>(),
    onCancel: vi.fn<UploadProps['onCancel']>(),
    onRetry: vi.fn<UploadProps['onRetry']>(),
    onReplace: vi.fn<UploadProps['onReplace']>(),
    onRemove: vi.fn<UploadProps['onRemove']>(),
  } satisfies UploadProps;
}

it('shows bounded progress and emits cancel, retry and remove intents for the matching queue item', () => {
  const props = fixture([
    {
      id: 'active',
      name: 'active.png',
      mimeType: 'image/png',
      size: 8,
      status: 'uploading',
      progress: 42,
    },
    {
      id: 'processing',
      name: 'processing.png',
      mimeType: 'image/png',
      size: 8,
      status: 'processing',
      progress: 150,
    },
    {
      id: 'failed',
      name: 'failed.png',
      mimeType: 'image/png',
      size: 8,
      status: 'error',
      progress: 0,
      error: 'Example transfer rejected',
    },
    {
      id: 'canceled',
      name: 'canceled.png',
      mimeType: 'image/png',
      size: 8,
      status: 'canceled',
      progress: 0,
    },
    {
      id: 'queued',
      name: 'queued.png',
      mimeType: 'image/png',
      size: 8,
      status: 'queued',
      progress: 0,
    },
  ]);
  render(<Upload {...props} />);
  expect(screen.getByRole('progressbar', { name: 'Progress active.png' })).toHaveProperty(
    'value',
    42,
  );
  expect(screen.getByRole('progressbar', { name: 'Progress processing.png' })).toHaveProperty(
    'value',
    100,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel active.png' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry event failed.png' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry event canceled.png' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove queued.png' }));
  expect(props.onCancel).toHaveBeenCalledExactlyOnceWith('active');
  expect(props.onRetry.mock.calls).toEqual([['failed'], ['canceled']]);
  expect(props.onRemove).toHaveBeenCalledExactlyOnceWith('queued');
  expect(screen.getByRole('alert').textContent).toContain('Example transfer rejected');
});

it('validates replacement files and permits selecting the same replacement twice', () => {
  const props = fixture([
    {
      id: 'original',
      name: 'original.png',
      mimeType: 'image/png',
      size: 8,
      status: 'ready',
      progress: 100,
    },
  ]);
  render(<Upload {...props} />);
  const input = screen.getByLabelText('Replace original.png');
  const replacement = new File(['new'], 'new.png', { type: 'image/png' });
  const invalid = new File(['text'], 'invalid.txt', { type: 'text/plain' });
  fireEvent.change(input, { target: { files: [invalid] } });
  expect(props.onReject).toHaveBeenCalledWith([{ file: invalid, reason: 'type' }]);
  expect(props.onReplace).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { files: [replacement] } });
  fireEvent.change(input, { target: { files: [replacement] } });
  expect(props.onReplace).toHaveBeenCalledTimes(2);
  expect(props.onReplace).toHaveBeenLastCalledWith('original', replacement);
});

it('rejects unsafe remote URLs and reports a valid URL without fetching its bytes', () => {
  const props = fixture();
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(<Upload {...props} />);
  fireEvent.change(screen.getByLabelText('Remote file URL'), {
    target: { value: 'javascript:alert(1)' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record URL event' }));
  expect(screen.getByRole('alert').textContent).toContain('Enter a valid HTTP or HTTPS URL.');
  expect(props.onRemoteUrl).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Remote file URL'), {
    target: { value: 'https://example.com/image.png' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record URL event' }));
  expect(props.onRemoteUrl).toHaveBeenCalledExactlyOnceWith('https://example.com/image.png');
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
});

it('supports local intake while a readOnly editor exposes metadata without modifying controls', () => {
  const props = fixture();
  const { rerender } = render(<Upload {...props} />);
  const file = new File(['a'], 'image.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [file] } });
  expect(props.onFiles).toHaveBeenCalledExactlyOnceWith([file]);
  rerender(
    <Upload
      {...props}
      readOnly
      items={[
        {
          id: 'ready',
          name: 'ready.png',
          mimeType: 'image/png',
          size: 9,
          status: 'ready',
          progress: Number.NaN,
        },
      ]}
    />,
  );
  expect(screen.getByText('ready.png')).toBeTruthy();
  expect(screen.queryByLabelText('Choose files')).toBeNull();
  expect(screen.queryByLabelText('Remote file URL')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it('regression: repeated intake cannot exceed the configured total file queue budget', () => {
  const props = fixture([
    {
      id: 'already-selected',
      name: 'first.png',
      mimeType: 'image/png',
      size: 8,
      status: 'queued',
      progress: 0,
    },
  ]);
  props.limits.maxFiles = 2;
  const second = new File(['second'], 'second.png', { type: 'image/png' });
  const excess = new File(['third'], 'third.png', { type: 'image/png' });
  render(<Upload {...props} />);
  fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [second, excess] } });
  expect(props.onFiles).toHaveBeenCalledExactlyOnceWith([second]);
  expect(props.onReject).toHaveBeenCalledExactlyOnceWith([{ file: excess, reason: 'count' }]);
});

it('displays generated preview metadata and changes only to a known selected size', () => {
  const onChange = vi.fn<(id: string) => void>();
  const variants = [
    {
      id: 'original',
      label: 'Original',
      file: {
        name: 'original.png',
        mimeType: 'image/png',
        size: 1200,
        width: 800,
        height: 600,
        url: '/original.png',
      },
    },
    {
      id: 'thumbnail',
      label: 'Thumbnail',
      file: {
        name: 'small.png',
        mimeType: 'image/png',
        size: 200,
        width: 320,
        height: 240,
        url: '/small.png',
      },
    },
  ];
  const props = {
    variants,
    onChange,
    label: 'Preview size',
    labels: copy.file,
    formatBytes: copy.formatBytes,
    formatDimensions: copy.formatDimensions,
  };
  const { rerender } = render(<PreviewSizes {...props} selectedId="original" />);
  expect(screen.getByText('800 × 600')).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Preview size' }), {
    target: { value: 'thumbnail' },
  });
  expect(onChange).toHaveBeenCalledExactlyOnceWith('thumbnail');
  rerender(<PreviewSizes {...props} selectedId="thumbnail" />);
  expect(screen.getByText('320 × 240')).toBeTruthy();
  expect(screen.getByRole('img').getAttribute('src')).toBe('/small.png');
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByRole('img', { name: 'Preview unavailable' })).toBeTruthy();
  rerender(<PreviewSizes {...props} selectedId="missing" />);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('Preview unavailable');
});

it('does not render an unsafe URL as an image or downloadable link', () => {
  render(
    <FileDetails
      file={{ name: 'unsafe.svg', mimeType: 'image/svg+xml', size: 4, url: 'javascript:alert(1)' }}
      labels={copy.file}
      formatBytes={copy.formatBytes}
      formatDimensions={copy.formatDimensions}
    />,
  );
  expect(document.querySelector('img')).toBeNull();
  expect(screen.getByRole('img', { name: 'Preview unavailable' })).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByText('unsafe.svg')).toBeTruthy();
});

it.each([
  ['', null],
  [' https://example.com', null],
  ['https://example.com/a b', null],
  ['//example.com/image', null],
  ['javascript:alert(1)', null],
  ['data:image/png;base64,AAAA', null],
  ['not a URL', null],
  ['/image.png', '/image.png'],
  ['https://example.com/image.png', 'https://example.com/image.png'],
  ['http://example.com/file', 'http://example.com/file'],
])('enforces resource protocol policy for %s', (value, expected) => {
  expect(safeResourceUrl(value)).toBe(expected);
});

it('permits explicitly owned blob previews while rejecting blob links by default', () => {
  expect(safeResourceUrl('blob:preview')).toBeNull();
  expect(safeResourceUrl('blob:preview', true)).toBe('blob:preview');
  expect(safeResourceUrl()).toBeNull();
});
