import { expect, it } from 'vitest';
import { loadConfig, loadDatabaseConfig, loadMigrationDatabaseConfig } from '../load-config.ts';

const base = {
  DATABASE_URL: 'postgresql:///postgres?host=/tmp',
  CMS_RATE_LIMIT_SECRET: 'an-independent-test-secret-with-32-characters',
};

it('requires database and a shared rate-limit secret instead of starting with implicit credentials', () => {
  expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  expect(() =>
    loadConfig({ DATABASE_URL: base.DATABASE_URL, CMS_RATE_LIMIT_SECRET: 'short' }),
  ).toThrow(/CMS_RATE_LIMIT_SECRET/);
  expect(() => loadConfig({ ...base, DATABASE_SCHEMA: 'public;DROP SCHEMA public' })).toThrow(
    /DATABASE_SCHEMA/,
  );
});

it('validates production transport and parses origins, SMTP credentials and port zero', () => {
  expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow('HTTPS');
  expect(() =>
    loadConfig({
      ...base,
      NODE_ENV: 'production',
      CMS_FRONTEND_URL: 'https://cms.example.test',
      API_ALLOWED_ORIGINS: 'http://cms.example.test',
    }),
  ).toThrow('HTTPS');
  const result = loadConfig({
    ...base,
    DATABASE_URL: 'postgresql://cms@database.example.test/cms?sslmode=verify-full',
    NODE_ENV: 'production',
    CMS_STORAGE_DRIVER: 's3',
    CMS_S3_BUCKET: 'cms-test-private',
    CMS_S3_REGION: 'ap-southeast-1',
    API_PORT: '0',
    SMTP_SECURE: 'false',
    SMTP_HOST: 'mail.example.test',
    SMTP_USER: 'cms',
    SMTP_PASSWORD: 'test-provider-credential',
    CMS_FRONTEND_URL: 'https://cms.example.test',
    API_ALLOWED_ORIGINS: 'https://cms.example.test, https://other.example.test',
  });
  expect(result.http.port).toBe(0);
  expect(result.http.allowedOrigins).toEqual([
    'https://cms.example.test',
    'https://other.example.test',
  ]);
  expect(result.smtp.requireTLS).toBe(true);
  expect(result.smtp.user).toBe('cms');
});

it('rejects production database URLs that do not require certificate and hostname verification', () => {
  for (const url of [
    'postgresql://cms@database.example.test/cms',
    'postgresql://cms@database.example.test/cms?sslmode=disable',
  ]) {
    expect(() =>
      loadConfig({
        ...base,
        DATABASE_URL: url,
        NODE_ENV: 'production',
        CMS_FRONTEND_URL: 'https://cms.example.test',
      }),
    ).toThrow('Verified PostgreSQL TLS');
  }
});

it('rejects duplicate sslmode parameters before the driver can override the verified mode', () => {
  const env = {
    ...base,
    NODE_ENV: 'production',
    CMS_FRONTEND_URL: 'https://cms.example.test',
    DATABASE_URL: 'postgresql://cms@database.example.test/cms?sslmode=verify-full&sslmode=disable',
  };
  expect(() => loadConfig(env)).toThrow('Verified PostgreSQL TLS');
  expect(() => loadDatabaseConfig(env)).toThrow('Verified PostgreSQL TLS');
});

it('requires a separate explicit migration connection in production and keeps development setup usable', () => {
  expect(loadMigrationDatabaseConfig(base).connectionString).toBe(base.DATABASE_URL);
  const migration = 'postgresql://schema_owner@database.example.test/cms?sslmode=verify-full';
  expect(
    loadMigrationDatabaseConfig({
      NODE_ENV: 'production',
      CMS_MIGRATION_DATABASE_URL: migration,
      DATABASE_SCHEMA: 'cms',
    }),
  ).toMatchObject({ connectionString: migration, schema: 'cms' });
  expect(() =>
    loadMigrationDatabaseConfig({
      NODE_ENV: 'production',
      DATABASE_URL: migration,
    }),
  ).toThrow('CMS_MIGRATION_DATABASE_URL');
  expect(() =>
    loadMigrationDatabaseConfig({
      NODE_ENV: 'production',
      CMS_MIGRATION_DATABASE_URL: 'postgresql://owner@db.example.test/cms',
    }),
  ).toThrow('Verified PostgreSQL TLS');
  expect(loadConfig(base).mode).toBe('development');
});

it('keeps navigation unregistered by default and parses an explicitly configured frontend directory', () => {
  expect(loadConfig(base)).toMatchObject({ navigation: { paths: [], icons: [] } });
  expect(
    loadConfig({
      ...base,
      CMS_NAVIGATION_PATHS: ' /dashboard, /reports ',
      CMS_NAVIGATION_ICONS: 'home,Chart',
    }),
  ).toMatchObject({ navigation: { paths: ['/dashboard', '/reports'], icons: ['home', 'Chart'] } });
});

it.each([
  { CMS_NAVIGATION_PATHS: 'https://external.example.test/dashboard' },
  { CMS_NAVIGATION_PATHS: '//external.example.test/dashboard' },
  { CMS_NAVIGATION_PATHS: '/dashboard?token=private' },
  { CMS_NAVIGATION_PATHS: '/dashboard#private' },
  { CMS_NAVIGATION_PATHS: '/settings/../dashboard' },
  { CMS_NAVIGATION_PATHS: '/settings\\dashboard' },
  { CMS_NAVIGATION_PATHS: '/dashboard,/dashboard' },
  { CMS_NAVIGATION_ICONS: 'home,home' },
  { CMS_NAVIGATION_ICONS: '<script>' },
])('rejects noncanonical or duplicate navigation configuration %j', (configuration) => {
  expect(() => loadConfig({ ...base, ...configuration })).toThrow('CMS_NAVIGATION');
});
