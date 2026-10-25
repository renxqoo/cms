import { expect, it } from 'vitest';
import { browserGroups, isolatedBrowserGroup } from '../browser-groups.ts';

it('gives every discovered browser file an independent realm and preserves Playwright filters', () => {
  expect(
    browserGroups(
      ['--project', 'production', '--grep', 'dialog'],
      ['b.browser.spec.ts', 'a.browser.spec.ts'],
    ),
  ).toEqual([
    ['a.browser.spec.ts', '--project', 'production', '--grep', 'dialog'],
    ['b.browser.spec.ts', '--project', 'production', '--grep', 'dialog'],
  ]);
  expect(
    browserGroups(['a.browser.spec.ts', 'a.browser.spec.ts', '--headed'], ['b.browser.spec.ts']),
  ).toEqual([['a.browser.spec.ts', '--headed']]);
  expect(() => browserGroups([], [])).toThrow('No browser specifications');
  expect(browserGroups(['--grep', 'dialog.browser.spec.ts'], ['a.browser.spec.ts'])).toEqual([
    ['a.browser.spec.ts', '--grep', 'dialog.browser.spec.ts'],
  ]);
  expect(browserGroups(['a.browser.spec.ts', '--grep', 'a.browser.spec.ts'], [])).toEqual([
    ['a.browser.spec.ts', '--grep', 'a.browser.spec.ts'],
  ]);
});

function resource(mode: string, closed: string[]) {
  return {
    mode,
    close: () => {
      closed.push(mode);
      return Promise.resolve();
    },
  };
}

it('reclaims the development realm when production startup fails', async () => {
  const closed: string[] = [];
  let ran = false;
  await expect(
    isolatedBrowserGroup({
      signal: new AbortController().signal,
      open: (mode) =>
        mode === 'production'
          ? Promise.reject(new Error('Production startup failed'))
          : Promise.resolve(resource(mode, closed)),
      run: () => {
        ran = true;
        return Promise.resolve();
      },
    }),
  ).rejects.toThrow('Production startup failed');
  expect(ran).toBe(false);
  expect(closed).toEqual(['development']);
});

it('reclaims both realms after a failing browser journey even if one close fails', async () => {
  const closed: string[] = [];
  await expect(
    isolatedBrowserGroup({
      signal: new AbortController().signal,
      open: (mode) =>
        Promise.resolve({
          close: () => {
            closed.push(mode);
            return mode === 'development'
              ? Promise.reject(new Error('Close failure'))
              : Promise.resolve();
          },
        }),
      run: () => Promise.reject(new Error('Browser failure')),
    }),
  ).rejects.toBeInstanceOf(AggregateError);
  expect(closed).toEqual(['development', 'production']);
});

it('SIGTERM-style cancellation during startup prevents the next process and closes allocated resources', async () => {
  const controller = new AbortController();
  const opened: string[] = [];
  const closed: string[] = [];
  let ran = false;
  await expect(
    isolatedBrowserGroup({
      signal: controller.signal,
      open: (mode) => {
        opened.push(mode);
        controller.abort(new Error('E2E interrupted by SIGTERM.'));
        return Promise.resolve(resource(mode, closed));
      },
      run: () => {
        ran = true;
        return Promise.resolve();
      },
    }),
  ).rejects.toThrow('SIGTERM');
  expect(opened).toEqual(['development']);
  expect(closed).toEqual(['development']);
  expect(ran).toBe(false);
});

it('does not start any server after cancellation and closes both after success', async () => {
  const controller = new AbortController();
  controller.abort(new Error('Stopped'));
  let starts = 0;
  const open = () => {
    starts++;
    return Promise.resolve({ close: () => Promise.resolve() });
  };
  await expect(
    isolatedBrowserGroup({ signal: controller.signal, open, run: () => Promise.resolve() }),
  ).rejects.toThrow('Stopped');
  expect(starts).toBe(0);
  const closed: string[] = [];
  await isolatedBrowserGroup({
    signal: new AbortController().signal,
    open: (mode) => Promise.resolve(resource(mode, closed)),
    run: (applications) => {
      expect(applications.map((application) => application.mode)).toEqual([
        'development',
        'production',
      ]);
      return Promise.resolve();
    },
  });
  expect(closed).toEqual(['development', 'production']);
});
