import { afterEach, expect, it, vi } from 'vitest';

const { exitCode } = process;
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('../config.ts');
  vi.doUnmock('../server.ts');
  process.exitCode = exitCode;
});

it('closes the server on shutdown and removes process listeners', async () => {
  const output: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((value) => {
    output.push(String(value));
    return true;
  });
  const closed = Promise.withResolvers<void>();
  const close = vi.fn<() => Promise<void>>().mockImplementation(() => {
    closed.resolve();
    return Promise.resolve();
  });
  const before = process.listeners('SIGTERM');
  vi.doMock('../config.ts', () => ({ loadMcpConfig: () => ({}) }));
  vi.doMock('../server.ts', () => ({
    startMcpServer: () => Promise.resolve({ port: 1234, close }),
  }));
  await import('../main.ts');
  expect(JSON.parse(output.join('')) as unknown).toMatchObject({
    event: 'listening',
    address: { port: 1234 },
  });
  const stop = process.listeners('SIGTERM').find((listener) => !before.includes(listener));
  stop?.('SIGTERM');
  await closed.promise;
  expect(close).toHaveBeenCalledOnce();
  expect(process.listeners('SIGTERM')).toEqual(before);
});

it('reports failure to close resources with a failing exit code', async () => {
  vi.resetModules();
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const before = process.listeners('SIGINT');
  vi.doMock('../config.ts', () => ({ loadMcpConfig: () => ({}) }));
  vi.doMock('../server.ts', () => ({
    startMcpServer: () =>
      Promise.resolve({ port: 1234, close: () => Promise.reject(new Error('failed')) }),
  }));
  await import('../main.ts');
  process.listeners('SIGINT').find((listener) => !before.includes(listener))?.('SIGINT');
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  expect(process.exitCode).toBe(1);
});
