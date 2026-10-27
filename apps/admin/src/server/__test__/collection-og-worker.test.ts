import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  data: undefined as unknown,
  port: { postMessage: vi.fn<(value: ArrayBuffer, transfers: ArrayBuffer[]) => void>() } as {
    postMessage: ReturnType<typeof vi.fn>;
  } | null,
  read: vi.fn<() => Promise<Uint8Array>>(),
  bytes: vi.fn<() => Promise<ArrayBuffer>>(),
}));
vi.mock('node:worker_threads', () => ({
  get workerData() {
    return state.data;
  },
  get parentPort() {
    return state.port;
  },
}));
vi.mock('node:fs/promises', () => ({ readFile: state.read }));
vi.mock('next/og', () => ({
  ImageResponse: class {
    arrayBuffer = state.bytes;
  },
}));
function preconnect(value: unknown): value is (origin: string) => void {
  return typeof value === 'function';
}
const originalFetch = globalThis.fetch;
const valid = () => ({
  title: 'Private',
  description: 'Current actor',
  brand: 'CMS',
  fontFile: '/local/font.ttf',
  width: 1200,
  height: 630,
  maxImageBytes: 32,
});
beforeEach(() => {
  vi.resetModules();
  state.data = valid();
  state.port = { postMessage: vi.fn<(value: ArrayBuffer, transfers: ArrayBuffer[]) => void>() };
  state.read.mockReset().mockResolvedValue(new Uint8Array([1, 2]));
  state.bytes.mockReset().mockResolvedValue(new Uint8Array([137, 80, 78, 71]).buffer);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});
it('isolated rendering only returns transferable local image bytes and refuses network fallback', async () => {
  await import('../collection-og-worker');
  expect(state.port?.postMessage).toHaveBeenCalledWith(expect.any(ArrayBuffer), [
    expect.any(ArrayBuffer),
  ]);
  await expect(fetch('https://example.test/font')).rejects.toThrow('Network unavailable');
  const guardedFetch = globalThis.fetch;
  expect(() => {
    if (!('preconnect' in guardedFetch) || !preconnect(guardedFetch.preconnect))
      throw new Error('Missing network guard');
    guardedFetch.preconnect('https://example.test');
  }).toThrow('Network unavailable');
});
it.each([
  null,
  [],
  false,
  { ...valid(), title: false },
  { ...valid(), description: false },
  { ...valid(), brand: false },
  { ...valid(), fontFile: false },
  { ...valid(), width: '1200' },
  { ...valid(), height: '630' },
  { ...valid(), maxImageBytes: '32' },
])('rejects invalid worker input before filesystem access: %j', async (data) => {
  state.data = data;
  await expect(import('../collection-og-worker')).rejects.toThrow('Invalid renderer input');
  expect(state.read).not.toHaveBeenCalled();
});
it('a missing parent port cannot render or silently succeed', async () => {
  state.port = null;
  await expect(import('../collection-og-worker')).rejects.toThrow('Renderer runtime unavailable');
  expect(state.read).not.toHaveBeenCalled();
});
it('oversized image bytes never leave the isolated renderer', async () => {
  state.bytes.mockResolvedValue(new ArrayBuffer(33));
  await expect(import('../collection-og-worker')).rejects.toThrow('Image exceeds response budget');
  expect(state.port?.postMessage).not.toHaveBeenCalled();
});
it('missing local font and renderer errors reject without partial bytes', async () => {
  state.read.mockRejectedValue(new Error('Missing font'));
  await expect(import('../collection-og-worker')).rejects.toThrow('Missing font');
  expect(state.port?.postMessage).not.toHaveBeenCalled();
});
