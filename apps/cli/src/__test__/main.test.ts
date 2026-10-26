import { afterEach, expect, it, vi } from 'vitest';
import { BareError } from '@renxqoo/agent-cli-sdk';

const { exitCode } = process;
afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../app.ts');
  vi.doUnmock('../config.ts');
  process.exitCode = exitCode;
});

it('removes cancellation listeners after a successful command', async () => {
  const beforeInt = process.listenerCount('SIGINT');
  const beforeTerm = process.listenerCount('SIGTERM');
  const run = vi.fn<(args: string[]) => Promise<void>>().mockResolvedValue();
  vi.doMock('../config.ts', () => ({ cliConfig: () => ({}) }));
  vi.doMock('../app.ts', () => ({
    createCli: () => ({ run }),
    cliFailure: () => {
      throw new BareError(4);
    },
  }));
  await import('../main.ts');
  expect(run).toHaveBeenCalledOnce();
  expect(process.listenerCount('SIGINT')).toBe(beforeInt);
  expect(process.listenerCount('SIGTERM')).toBe(beforeTerm);
});

it('cancels an active command and preserves a handled CLI failure exit code', async () => {
  vi.resetModules();
  let observed: AbortSignal | undefined;
  vi.doMock('../config.ts', () => ({ cliConfig: () => ({}) }));
  vi.doMock('../app.ts', () => ({
    createCli: (_config: unknown, signal: AbortSignal) => {
      observed = signal;
      return {
        run: () => {
          const cancel = process.listeners('SIGINT').at(-1);
          cancel?.('SIGINT');
          return Promise.reject(new Error('cancelled'));
        },
      };
    },
    cliFailure: () => {
      throw new BareError(4);
    },
  }));
  await import('../main.ts');
  expect(observed?.aborted).toBe(true);
  expect(process.exitCode).toBe(4);
});

it('fails with a nonzero code when error rendering itself fails', async () => {
  vi.resetModules();
  vi.doMock('../config.ts', () => ({
    cliConfig: () => {
      throw new Error('bad config');
    },
  }));
  vi.doMock('../app.ts', () => ({
    createCli: () => ({}),
    cliFailure: () => {
      throw new Error('render failed');
    },
  }));
  await import('../main.ts');
  expect(process.exitCode).toBe(1);
});
