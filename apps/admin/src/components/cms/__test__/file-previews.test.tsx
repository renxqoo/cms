import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFilePreviews } from '../file-previews';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('replaced and removed file previews are revoked while retained files keep their URL', () => {
  const create = vi.fn<(file: Blob | MediaSource) => string>();
  create
    .mockReturnValueOnce('blob:first')
    .mockReturnValueOnce('blob:retained')
    .mockReturnValueOnce('blob:replacement');
  const revoke = vi.fn<(url: string) => void>();
  class PreviewURL extends URL {
    static override createObjectURL = create;
    static override revokeObjectURL = revoke;
  }
  vi.stubGlobal('URL', PreviewURL);
  const first = new File(['one'], 'one.png', { type: 'image/png' });
  const retained = new File(['two'], 'two.png', { type: 'image/png' });
  const replacement = new File(['three'], 'three.png', { type: 'image/png' });
  const { result, rerender, unmount } = renderHook(({ files }) => useFilePreviews(files), {
    initialProps: { files: [first, retained] },
  });
  expect(result.current.get(first)).toBe('blob:first');
  expect(result.current.get(retained)).toBe('blob:retained');
  rerender({ files: [retained, replacement] });
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:first');
  expect(result.current.get(first)).toBeUndefined();
  expect(result.current.get(retained)).toBe('blob:retained');
  expect(result.current.get(replacement)).toBe('blob:replacement');
  rerender({ files: [retained, replacement] });
  expect(create).toHaveBeenCalledTimes(3);
  unmount();
  expect(revoke.mock.calls.map(([url]) => url)).toEqual([
    'blob:first',
    'blob:retained',
    'blob:replacement',
  ]);
});
