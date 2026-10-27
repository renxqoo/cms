import { expect, it } from 'vitest';
import { downloadFilename, validateRename } from '../filenames.ts';

it('preserves an original extension while rejecting paths, controls, blank names and unchanged names', () => {
  expect(() => validateRename('old.pdf', 'New.PDF')).not.toThrow();
  expect(() => validateRename('README', 'LICENSE')).not.toThrow();
  for (const filename of [
    'old.pdf',
    'other.png',
    '../other.pdf',
    'x/other.pdf',
    'x\\other.pdf',
    '\u0000.pdf',
    '\u007f.pdf',
    '\u0085.pdf',
    '',
    ' ',
    '.',
    '..',
    `${'x'.repeat(252)}.pdf`,
  ])
    expect(() => validateRename('old.pdf', filename), filename).toThrowError(
      expect.objectContaining({ code: 'invalid_input' }),
    );
});
it('derives variant filenames from the current stem and real output type while preserving original names', () => {
  expect(downloadFilename({ filename: 'Photo.PNG', mimeType: 'image/png' })).toBe('Photo.PNG');
  expect(
    downloadFilename({ filename: 'Photo.PNG', variant: 'original', mimeType: 'image/png' }),
  ).toBe('Photo.PNG');
  expect(
    downloadFilename({ filename: 'Photo.PNG', variant: 'thumb', mimeType: 'image/webp' }),
  ).toBe('Photo-thumb.webp');
  expect(downloadFilename({ filename: 'Photo', variant: 'thumb', mimeType: 'image/jpeg' })).toBe(
    'Photo-thumb.jpg',
  );
  expect(downloadFilename({ filename: 'Photo.jpg', variant: 'tiny', mimeType: 'image/png' })).toBe(
    'Photo-tiny.png',
  );
  expect(() =>
    downloadFilename({ filename: 'File.pdf', variant: 'tiny', mimeType: 'application/pdf' }),
  ).toThrowError(expect.objectContaining({ code: 'unsupported_media_type' }));
});
