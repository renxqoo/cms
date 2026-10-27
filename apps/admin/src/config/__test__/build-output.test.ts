import { dirname, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function outputDirectory(mode?: '1' | 'suite') {
  vi.stubEnv('CMS_ADMIN_E2E', mode);
  vi.resetModules();
  const { default: config } = await import('../../../next.config');
  return resolve('apps/admin', config.distDir ?? '.next');
}

it('regression: browser journeys cannot overwrite the application output or share its development lock', async () => {
  const application = await outputDirectory();
  const journey = await outputDirectory('1');
  expect(journey).not.toBe(application);
  expect(dirname(journey)).toBe(dirname(application));
  expect(resolve(journey, 'dev/lock')).not.toBe(resolve(application, 'dev/lock'));
});

it('regression: complete browser verification cannot overwrite a visible fixture or share its development lock', async () => {
  const application = await outputDirectory();
  const fixture = await outputDirectory('1');
  const suite = await outputDirectory('suite');
  expect(new Set([application, fixture, suite]).size).toBe(3);
  expect(new Set([application, fixture, suite].map((path) => resolve(path, 'dev/lock'))).size).toBe(
    3,
  );
  expect(dirname(suite)).toBe(dirname(application));
});
