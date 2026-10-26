import { expect, it } from 'vitest';
import { loadConfig, loadDatabaseConfig, loadMigrationDatabaseConfig } from '../load-config.ts';

const oauthProduction = {
  CMS_API_ORIGIN: 'https://api.example.test',
  CMS_MCP_RESOURCE: 'https://mcp.example.test/mcp',
  CMS_MCP_BRIDGE_SECRET: 'independent-mcp-bridge-secret-with-32-characters',
};

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
      ...oauthProduction,
      CMS_FRONTEND_URL: 'https://cms.example.test',
      API_ALLOWED_ORIGINS: 'http://cms.example.test',
    }),
  ).toThrow('HTTPS');
  const result = loadConfig({
    ...base,
    DATABASE_URL: 'postgresql://cms@database.example.test/cms?sslmode=verify-full',
    NODE_ENV: 'production',
    ...oauthProduction,
    CMS_STORAGE_DRIVER: 's3',
    CMS_S3_BUCKET: 'cms-test-private',
    CMS_S3_REGION: 'ap-southeast-1',
    ONEASTER_CLIENT_ORIGIN: 'https://client.example.test',
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
    'https://client.example.test',
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
        ...oauthProduction,
        CMS_FRONTEND_URL: 'https://cms.example.test',
      }),
    ).toThrow('Verified PostgreSQL TLS');
  }
});

it('rejects duplicate sslmode parameters before the driver can override the verified mode', () => {
  const env = {
    ...base,
    NODE_ENV: 'production',
    ...oauthProduction,
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
      ...oauthProduction,
      CMS_MIGRATION_DATABASE_URL: migration,
      DATABASE_SCHEMA: 'cms',
    }),
  ).toMatchObject({ connectionString: migration, schema: 'cms' });
  expect(() =>
    loadMigrationDatabaseConfig({
      NODE_ENV: 'production',
      ...oauthProduction,
      DATABASE_URL: migration,
    }),
  ).toThrow('CMS_MIGRATION_DATABASE_URL');
  expect(() =>
    loadMigrationDatabaseConfig({
      NODE_ENV: 'production',
      ...oauthProduction,
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

it('uses one canonical client origin and rejects insecure or credential-bearing preview destinations', () => {
  expect(loadConfig(base).delivery.clientOrigin).toBe('http://localhost:9090');
  for (const origin of [
    'https://client.example.test/path',
    'https://user:secret@client.example.test',
    'https://client.example.test?token=x',
    'https://client.example.test#token',
    'http://remote.example.test',
    'https://client.example.test/',
  ]) {
    expect(() => loadConfig({ ...base, ONEASTER_CLIENT_ORIGIN: origin })).toThrow(
      'ONEASTER_CLIENT_ORIGIN',
    );
  }
  const production = {
    ...base,
    NODE_ENV: 'production',
    CMS_FRONTEND_URL: 'https://cms.example.test',
    DATABASE_URL: 'postgresql://cms@database.example.test/cms?sslmode=verify-full',
    ...oauthProduction,
  };
  expect(() => loadConfig(production)).toThrow('ONEASTER_CLIENT_ORIGIN');
  expect(() =>
    loadConfig({ ...production, ONEASTER_CLIENT_ORIGIN: 'http://localhost:9090' }),
  ).toThrow('ONEASTER_CLIENT_ORIGIN');
});

it.each([
  { CMS_API_ORIGIN: 'https://api.example.test/path' },
  { CMS_API_ORIGIN: 'https://user:secret@api.example.test' },
  { CMS_API_ORIGIN: 'https://api.example.test?query=value' },
  { CMS_MCP_RESOURCE: 'https://mcp.example.test/other' },
  { CMS_MCP_RESOURCE: 'https://mcp.example.test/mcp#fragment' },
])('rejects noncanonical issuer and resource configuration %j', (value) => {
  expect(() => loadConfig({ ...base, ...value })).toThrow('Invalid OAuth issuer or MCP resource');
});

it('requires HTTPS API/MCP resources and an independent bridge secret in production', () => {
  const production = {
    ...base,
    ...oauthProduction,
    NODE_ENV: 'production',
    CMS_FRONTEND_URL: 'https://cms.example.test',
    DATABASE_URL: 'postgresql://cms@db.example.test/cms?sslmode=verify-full',
    ONEASTER_CLIENT_ORIGIN: 'https://client.example.test',
  };
  for (const bad of [
    { CMS_API_ORIGIN: 'http://127.0.0.1:3001' },
    { CMS_MCP_RESOURCE: 'http://127.0.0.1:3002/mcp' },
    { CMS_MCP_BRIDGE_SECRET: base.CMS_RATE_LIMIT_SECRET },
  ])
    expect(() => loadConfig({ ...production, ...bad })).toThrow(
      'Public HTTPS OAuth resources and an independent MCP bridge secret',
    );
});
