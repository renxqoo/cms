import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { UploadInput } from '../upload-input';
import type { UploadInputProps } from '../upload-input';
import type { RelationshipValue } from '../relationship-input';
import type { FileRejection } from '../dropzone';
import { getCmsMessages } from '../../../features/ui-lab/cms-messages';

afterEach(cleanup);
const copy = getCmsMessages('en');

function fixture() {
  return {
    mode: 'single',
    label: 'Media relationship',
    collections: [{ id: 'media', label: 'Media' }],
    options: [{ collection: 'media', id: 'photo', label: 'Cover', previewUrl: '/cover.png' }],
    value: { collection: 'media', id: 'photo', label: 'Cover' },
    onChange: vi.fn<(value: RelationshipValue | null) => void>(),
    appearance: 'drawer',
    maxRows: 1,
    labels: copy.relationship,
    allowCreate: true,
    displayPreview: true,
    fileLimits: { maxFiles: 1, maxBytes: 10, accept: ['image/*'] },
    dropzoneLabels: copy.dropzone,
    onFiles: vi.fn<(files: File[]) => void>(),
    onReject: vi.fn<(rejections: FileRejection[]) => void>(),
    onCreate: vi.fn<(collection: string) => void>(),
  } satisfies UploadInputProps;
}

it('renders selected media previews and forwards only permitted file/create intents', () => {
  const props = fixture();
  render(<UploadInput {...props} />);
  expect(screen.getByRole('img', { name: 'Cover' }).getAttribute('src')).toBe('/cover.png');
  fireEvent.click(screen.getByRole('button', { name: 'Create local example Media' }));
  expect(props.onCreate).toHaveBeenCalledExactlyOnceWith('media');
  const invalid = new File(['plain'], 'plain.txt', { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [invalid] } });
  expect(props.onReject).toHaveBeenCalledExactlyOnceWith([{ file: invalid, reason: 'type' }]);
  const file = new File(['image'], 'image.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [file] } });
  expect(props.onFiles).toHaveBeenCalledExactlyOnceWith([file]);
});

it('keeps existing selection available without granting media creation or readOnly modification', () => {
  const props = fixture();
  const { rerender } = render(
    <UploadInput {...props} allowCreate={false} displayPreview={false} />,
  );
  expect(screen.queryByLabelText('Choose files')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create local example Media' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Choose existing documents' })).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
  rerender(<UploadInput {...props} readOnly />);
  expect(screen.getByRole('img', { name: 'Cover' })).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByLabelText('Choose files')).toBeNull();
  expect(props.onChange).not.toHaveBeenCalled();
});
