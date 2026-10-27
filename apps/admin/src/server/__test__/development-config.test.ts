import { afterEach, expect, it, vi } from 'vitest';
import { loadAdminConfig } from '../config';

afterEach(() => vi.unstubAllEnvs());

it('connects the development BFF to API 9091 and validates browser origin 9092 by default', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('CMS_API_BASE_URL', '');
  vi.stubEnv('CMS_ADMIN_ORIGIN', '');
  delete process.env.CMS_API_BASE_URL;
  delete process.env.CMS_ADMIN_ORIGIN;
  expect(loadAdminConfig()).toMatchObject({
    apiBaseUrl: 'http://127.0.0.1:9091',
    adminOrigin: 'http://localhost:9092',
    secureCookie: false,
  });
});
