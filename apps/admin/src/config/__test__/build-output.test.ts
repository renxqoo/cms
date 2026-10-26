import { dirname, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function outputDirectory(test: boolean) {
  vi.stubEnv('CMS_ADMIN_E2E', test ? '1' : undefined);
  vi.resetModules();
  const { default: config } = await import('../../../next.config');
  return resolve('apps/admin', config.distDir ?? '.next');
}

it('regression: browser journeys cannot overwrite the application output or share its development lock', async () => {
  const application = await outputDirectory(false);
  const journey = await outputDirectory(true);
  expect(journey).not.toBe(application);
  expect(dirname(journey)).toBe(dirname(application));
  expect(resolve(journey, 'dev/lock')).not.toBe(resolve(application, 'dev/lock'));
});
