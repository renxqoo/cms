import { isIP } from 'node:net';

export interface ProductionConfig {
  apiOrigin: string;
  adminOrigin: string;
  hostname: string;
  port: number;
  adminPort: number;
}

const allowed = new Set([
  'NODE_ENV',
  'API_HOST',
  'API_PORT',
  'API_ALLOWED_HOSTS',
  'API_ALLOWED_ORIGINS',
  'DATABASE_URL',
  'DATABASE_SCHEMA',
  'CMS_MIGRATION_DATABASE_URL',
  'CMS_RATE_LIMIT_SECRET',
  'CMS_API_ORIGIN',
  'CMS_MCP_RESOURCE',
  'CMS_MCP_BRIDGE_SECRET',
  'CMS_FRONTEND_URL',
  'CMS_ADMIN_ORIGIN',
  'CMS_API_BASE_URL',
  'CMS_STORAGE_DRIVER',
  'CMS_STORAGE_ROOT',
  'CMS_S3_BUCKET',
  'CMS_S3_REGION',
  'CMS_S3_ENDPOINT',
  'CMS_S3_FORCE_PATH_STYLE',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
  'ONEASTER_CLIENT_ORIGIN',
  'ONEASTER_PUBLIC_READ_IP_LIMIT',
  'CMS_NAVIGATION_PATHS',
  'CMS_NAVIGATION_ICONS',
  'CMS_MAINTENANCE_INTERVAL_MS',
  'CMS_ASSET_PROCESSING_INTERVAL_MS',
  'ADMIN_PORT',
]);

function variables(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z_]+)=(.*)$/.exec(trimmed);
    if (!match || !allowed.has(match[1]) || result.has(match[1]))
      throw new Error('Production environment must contain unique supported KEY=value entries');
    result.set(match[1], match[2]);
  }
  return result;
}

function origin(value: string | undefined, key: string): URL {
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    throw new Error(`${key} must be an HTTP(S) origin`);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && key !== 'CMS_MCP_RESOURCE') ||
    url.search ||
    url.hash
  )
    throw new Error(`${key} must be an HTTP(S) origin without credentials`);
  return url;
}

function publicOrigin(env: Map<string, string>, key: string): URL {
  const url = origin(env.get(key), key);
  if (
    url.protocol !== 'https:' ||
    url.port ||
    isIP(url.hostname) !== 0 ||
    !/^[a-z0-9.-]+$/i.test(url.hostname) ||
    !url.hostname.includes('.') ||
    url.hostname.endsWith('.example.com')
  )
    throw new Error(`${key} must use a real HTTPS DNS hostname on port 443`);
  return url;
}

function deploymentPorts(env: Map<string, string>) {
  if (env.get('NODE_ENV') !== 'production') throw new Error('NODE_ENV must be production');
  const apiPort = env.get('API_PORT') ?? '';
  if (apiPort !== '9091') throw new Error('CMS Docker deployment requires API_PORT=9091');
  const adminPort = env.get('ADMIN_PORT') ?? '';
  if (adminPort !== '9092') throw new Error('CMS Docker deployment requires ADMIN_PORT=9092');
  if (env.get('API_HOST') !== '127.0.0.1')
    throw new Error('API_HOST must be 127.0.0.1 for host-networked deployment');
  return { apiPort, adminPort };
}

function validateDatabase(env: Map<string, string>) {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(env.get('DATABASE_URL') ?? '');
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  if (!/^postgres(ql)?:$/.test(databaseUrl.protocol))
    throw new Error('DATABASE_URL must use the postgres protocol');
  const sslmodes = databaseUrl.searchParams.getAll('sslmode');
  const privateHost =
    databaseUrl.hostname === 'localhost' ||
    databaseUrl.hostname === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(databaseUrl.hostname) ||
    /^10(?:\.\d{1,3}){3}$/.test(databaseUrl.hostname) ||
    /^192\.168(?:\.\d{1,3}){2}$/.test(databaseUrl.hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(databaseUrl.hostname);
  if (privateHost ? sslmodes.length > 1 : sslmodes.join('') !== 'verify-full')
    throw new Error(
      privateHost
        ? 'DATABASE_URL must not repeat sslmode'
        : 'DATABASE_URL must require verified TLS (sslmode=verify-full)',
    );
}

function validateStorageAndSecrets(env: Map<string, string>) {
  const storage = env.get('CMS_STORAGE_DRIVER');
  if (storage === 's3') {
    for (const key of ['CMS_S3_BUCKET', 'CMS_S3_REGION'] as const)
      if (!env.get(key)) throw new Error(`${key} is required for shared S3 storage`);
  } else if (storage !== 'local') {
    throw new Error('CMS_STORAGE_DRIVER must be local or s3');
  }
  if (storage === 'local' && (env.get('CMS_STORAGE_ROOT') ?? '').startsWith('.'))
    throw new Error('CMS_STORAGE_ROOT must be an absolute path in production');
  for (const key of ['CMS_RATE_LIMIT_SECRET', 'CMS_MCP_BRIDGE_SECRET'] as const) {
    const value = env.get(key) ?? '';
    if (value.length < 32 || value.startsWith('REPLACE_'))
      throw new Error(`${key} must contain at least 32 characters`);
  }
  if (env.get('CMS_MCP_BRIDGE_SECRET') === env.get('CMS_RATE_LIMIT_SECRET'))
    throw new Error('CMS_MCP_BRIDGE_SECRET must differ from CMS_RATE_LIMIT_SECRET');
}

export function parseProductionConfig(text: string): ProductionConfig {
  const env = variables(text);
  const { apiPort, adminPort } = deploymentPorts(env);
  const api = publicOrigin(env, 'CMS_API_ORIGIN');
  const admin = publicOrigin(env, 'CMS_ADMIN_ORIGIN');
  const frontend = origin(env.get('CMS_FRONTEND_URL'), 'CMS_FRONTEND_URL');
  if (frontend.origin !== admin.origin)
    throw new Error('CMS_FRONTEND_URL must match CMS_ADMIN_ORIGIN');
  const apiBase = env.get('CMS_API_BASE_URL') ?? '';
  if (apiBase !== 'http://127.0.0.1:9091')
    throw new Error('CMS_API_BASE_URL must be the loopback API origin http://127.0.0.1:9091');
  validateDatabase(env);
  validateStorageAndSecrets(env);
  const hosts = (env.get('API_ALLOWED_HOSTS') ?? '').split(',').map((part) => part.trim());
  if (!hosts.includes(api.hostname) || !hosts.includes('127.0.0.1'))
    throw new Error('API_ALLOWED_HOSTS must include the public API hostname and 127.0.0.1');
  return {
    apiOrigin: api.origin,
    adminOrigin: admin.origin,
    hostname: admin.hostname,
    port: Number(apiPort),
    adminPort: Number(adminPort),
  };
}

export function renderNginx(template: string, config: ProductionConfig): string {
  return template
    .replaceAll('__SERVER_NAME__', config.hostname)
    .replaceAll('__PORT__', String(config.port));
}
