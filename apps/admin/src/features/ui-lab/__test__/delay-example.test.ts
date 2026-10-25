import { afterEach, expect, it, vi } from 'vitest';
import { delayExample } from '../delay-example';

afterEach(() => vi.useRealTimers());

it('local delayed options resolve their supplied result and release their timer', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const result = delayExample('local option', controller.signal, 350);
  await vi.advanceTimersByTimeAsync(350);
  expect(await result).toBe('local option');
  expect(vi.getTimerCount()).toBe(0);
});

it('cancelled option work rejects immediately or during its delay without a live timer', async () => {
  vi.useFakeTimers();
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(delayExample('unused', cancelled.signal, 350)).rejects.toMatchObject({
    name: 'AbortError',
  });
  const current = new AbortController();
  const pending = delayExample('unused', current.signal, 350).catch((error: unknown) => error);
  current.abort();
  expect(await pending).toMatchObject({ name: 'AbortError' });
  expect(vi.getTimerCount()).toBe(0);
});
