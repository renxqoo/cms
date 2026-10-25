import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Dropzone } from '../dropzone';
import type { FileRejection } from '../dropzone';

afterEach(cleanup);

const labels = {
  label: 'Files',
  description: 'Choose or drop files',
  choose: 'Choose files',
  count: 'Too many files',
  size: 'File too large',
  type: 'Unsupported type',
};

it('accepts the exact byte limit and rejects an oversized or unsupported file', () => {
  const onFiles = vi.fn<(files: File[]) => void>();
  const onReject = vi.fn<(rejections: FileRejection[]) => void>();
  const accepted = new File(['1234'], 'small.png', { type: 'image/png' });
  const oversized = new File(['12345'], 'large.png', { type: 'image/png' });
  const unsupported = new File(['abc'], 'readme.txt', { type: 'text/plain' });
  render(
    <Dropzone
      labels={labels}
      limits={{ maxFiles: 3, maxBytes: 4, accept: ['image/*'] }}
      onFiles={onFiles}
      onReject={onReject}
    />,
  );
  fireEvent.change(screen.getByLabelText('Choose files'), {
    target: { files: [accepted, oversized, unsupported] },
  });
  expect(onFiles).toHaveBeenCalledWith([accepted]);
  expect(onReject).toHaveBeenCalledWith([
    { file: oversized, reason: 'size' },
    { file: unsupported, reason: 'type' },
  ]);
});

it('keeps file intake local to the focused dropzone and refuses disabled intake', () => {
  const onFiles = vi.fn<(files: File[]) => void>();
  const file = new File(['a'], 'photo.png', { type: 'image/png' });
  const { rerender } = render(
    <Dropzone
      labels={labels}
      limits={{ maxFiles: 1, maxBytes: 4, accept: ['.png'] }}
      onFiles={onFiles}
      onReject={vi.fn<(rejections: FileRejection[]) => void>()}
    />,
  );
  fireEvent.paste(document.body, { clipboardData: { files: [file] } });
  expect(onFiles).not.toHaveBeenCalled();
  screen.getByRole('group', { name: 'Files' }).focus();
  fireEvent.paste(screen.getByRole('group', { name: 'Files' }), {
    clipboardData: { files: [file] },
  });
  expect(onFiles).toHaveBeenCalledWith([file]);
  onFiles.mockClear();
  rerender(
    <Dropzone
      disabled
      labels={labels}
      limits={{ maxFiles: 1, maxBytes: 4, accept: ['.png'] }}
      onFiles={onFiles}
      onReject={vi.fn<(rejections: FileRejection[]) => void>()}
    />,
  );
  fireEvent.drop(screen.getByRole('group', { name: 'Files' }), {
    dataTransfer: { files: [file] },
  });
  expect(onFiles).not.toHaveBeenCalled();
});

it.each([
  [['image/png'], 'photo.png', 'image/png'],
  [['*/*'], 'file.bin', 'application/octet-stream'],
  [['.PNG'], 'PHOTO.png', ''],
  [[], 'file.bin', ''],
])('accepts the configured MIME or extension grammar %j', (accept, name, type) => {
  const onFiles = vi.fn<(files: File[]) => void>();
  const file = new File(['x'], name, { type });
  render(
    <Dropzone
      labels={labels}
      limits={{ maxFiles: 1, maxBytes: 1, accept }}
      onFiles={onFiles}
      onReject={vi.fn<(rejections: FileRejection[]) => void>()}
    />,
  );
  const group = screen.getByRole('group', { name: 'Files' });
  fireEvent.dragOver(group);
  fireEvent.dragLeave(group, { relatedTarget: screen.getByLabelText('Choose files') });
  fireEvent.dragLeave(group, { relatedTarget: document.body });
  fireEvent.drop(group, { dataTransfer: { files: [file] } });
  expect(onFiles).toHaveBeenCalledExactlyOnceWith([file]);
});

it('rejects count overflow and fails closed for an invalid file-count budget', () => {
  const onFiles = vi.fn<(files: File[]) => void>();
  const onReject = vi.fn<(rejections: FileRejection[]) => void>();
  const first = new File([], 'first.png', { type: 'image/png' });
  const extra = new File([], 'extra.png', { type: 'image/png' });
  const { rerender } = render(
    <Dropzone
      labels={labels}
      limits={{ maxFiles: 1, maxBytes: 1, accept: ['image/png'] }}
      onFiles={onFiles}
      onReject={onReject}
    />,
  );
  fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [first, extra] } });
  expect(onFiles).toHaveBeenCalledExactlyOnceWith([first]);
  expect(onReject).toHaveBeenCalledExactlyOnceWith([{ file: extra, reason: 'count' }]);
  rerender(
    <Dropzone
      labels={labels}
      limits={{ maxFiles: Number.NaN, maxBytes: Number.NaN, accept: ['image/png'] }}
      onFiles={onFiles}
      onReject={onReject}
    />,
  );
  fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [first] } });
  expect(onReject).toHaveBeenLastCalledWith([{ file: first, reason: 'count' }]);
  expect(onFiles).toHaveBeenCalledTimes(1);
});
