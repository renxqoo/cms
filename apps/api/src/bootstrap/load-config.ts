import { z } from 'zod';
import { loadStorageConfig } from './storage-config.ts';
import type { StorageConfig } from './storage-config.ts';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { navigationIconsSchema, navigationPathsSchema } from './navigation-config.ts';

const environmentSchema = z.object({
  DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:/.test(value)),
  DATABASE_SCHEMA: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/)
    .default('public'),
  CMS_RATE_LIMIT_SECRET: z.string().min(32),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  API_ALLOWED_HOSTS: z.string().default('localhost,127.0.0.1,[::1]'),
  API_ALLOWED_ORIGINS: z.string().default(''),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.email().default('cms@localhost.invalid'),
  CMS_FRONTEND_URL: z.url().default('http://localhost:3000'),
  ONEASTER_CLIENT_ORIGIN: z.string().optional(),
  ONEASTER_PUBLIC_READ_IP_LIMIT: z.coerce.number().int().min(1).max(1_000_000).default(6000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CMS_NAVIGATION_PATHS: z.string().default('').transform(commaList).pipe(navigationPathsSchema),
  CMS_NAVIGATION_ICONS: z.string().default('').transform(commaList).pipe(navigationIconsSchema),
  CMS_MAINTENANCE_INTERVAL_MS: z.coerce.number().int().min(25).max(3_600_000).default(60_000),
  CMS_ASSET_PROCESSING_INTERVAL_MS: z.coerce.number().int().min(25).max(60_000).default(1000),
});

export interface ApplicationConfig {
  assetProcessingIntervalMs: number;
  mode: 'development' | 'test' | 'production';
  storage: StorageConfig;
  delivery: { clientOrigin: string; publicReadIpRateLimit: number };
  database: { connectionString: string; schema: string; maxConnections: number };
  navigation: { paths: readonly string[]; icons: readonly string[] };
  policy: CmsPolicy;
  password: {
    N: number;
    r: number;
    p: number;
    saltBytes: number;
    keyBytes: number;
    maxmemBytes: number;
  };
  http: {
    host: string;
    port: number;
    allowedHosts: string[];
    allowedOrigins: string[];
    bodyLimitBytes: number;
    uploadBodyLimitBytes: number;
    uploadTimeoutMs: number;
    headerLimitBytes: number;
    urlLimitBytes: number;
    requestTimeoutMs: number;
    shutdownTimeoutMs: number;
    maxRequests: number;
  };
  smtp: {
    host?: string;
    port: number;
    secure: boolean;
    requireTLS: boolean;
    user?: string;
    password?: string;
    from: string;
    frontendUrl: string;
    timeoutMs: number;
  };
}

export function defaultPolicy(rateLimitSecret: string): CmsPolicy {
  return {
    sessionTtlMs: 28_800_000,
    invitationTtlMs: 86_400_000,
    resetTtlMs: 1_800_000,
    invitationCooldownMs: 60_000,
    resetCooldownMs: 60_000,
    maxSessions: 10,
    maxRoles: 1000,
    maxPermissions: 10_000,
    maxNavigationNodes: 2000,
    maxRolePermissions: 2000,
    maxAuditBytes: 262_144,
    maxPageSize: 100,
    defaultPageSize: 20,
    requestTimeoutMs: 15_000,
    statementTimeoutMs: 5000,
    lockTimeoutMs: 2000,
    connectionTimeoutMs: 2000,
    securityLockKey: 1_171_904_221,
    maintenanceLockKey: 1_171_904_222,
    idempotencyTtlMs: 86_400_000,
    rateWindowMs: 60_000,
    ipRateLimit: 120,
    userRateLimit: 60,
    loginIpLimit: 20,
    loginEmailIpLimit: 5,
    resetIpLimit: 5,
    invitationActorLimit: 10,
    rateLimitSecret,
    passwordTimeoutMs: 5000,
    passwordConcurrency: 4,
    passwordQueueLimit: 8,
    passwordQueueTimeoutMs: 1000,
    smtpTimeoutMs: 5000,
    mailTaskTimeoutMs: 10_000,
    mailConcurrency: 4,
    cleanupIntervalMs: 60_000,
    cleanupBatchSize: 100,
    retentionMs: 604_800_000,
    deliveryStaleMs: 30_000,
  };
}

function commaList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function smtpOptions(env: z.infer<typeof environmentSchema>): ApplicationConfig['smtp'] {
  return {
    ...(env.SMTP_HOST === undefined ? {} : { host: env.SMTP_HOST }),
    ...(env.SMTP_USER === undefined ? {} : { user: env.SMTP_USER }),
    ...(env.SMTP_PASSWORD === undefined ? {} : { password: env.SMTP_PASSWORD }),
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === 'true',
    requireTLS: env.NODE_ENV === 'production' && env.SMTP_SECURE !== 'true',
    from: env.SMTP_FROM,
    frontendUrl: env.CMS_FRONTEND_URL,
    timeoutMs: 5000,
  };
}

function validateProduction(env: z.infer<typeof environmentSchema>): void {
  if (env.NODE_ENV !== 'production') return;
  if (!env.CMS_FRONTEND_URL.startsWith('https://')) throw new Error('HTTPS frontend is required');
  for (const origin of commaList(env.API_ALLOWED_ORIGINS)) {
    if (!origin.startsWith('https://')) throw new Error('HTTPS origins are required');
  }
  requireDatabaseTls(env);
}

function requireDatabaseTls(env: { NODE_ENV: string; DATABASE_URL: string }): void {
  if (env.NODE_ENV !== 'production') return;
  const modes = new URL(env.DATABASE_URL).searchParams.getAll('sslmode');
  if (modes.length !== 1 || modes[0] !== 'verify-full') {
    throw new Error('Verified PostgreSQL TLS is required in production');
  }
}

export function loadDatabaseConfig(
  source: NodeJS.ProcessEnv = process.env,
): ApplicationConfig['database'] {
  const env = environmentSchema
    .pick({ DATABASE_URL: true, DATABASE_SCHEMA: true, NODE_ENV: true })
    .parse(source);
  requireDatabaseTls(env);
  return { connectionString: env.DATABASE_URL, schema: env.DATABASE_SCHEMA, maxConnections: 2 };
}

export function loadMigrationDatabaseConfig(
  source: NodeJS.ProcessEnv = process.env,
): ApplicationConfig['database'] {
  const env = environmentSchema.pick({ DATABASE_SCHEMA: true, NODE_ENV: true }).parse(source);
  const selected =
    source.CMS_MIGRATION_DATABASE_URL ??
    (env.NODE_ENV === 'production' ? undefined : source.DATABASE_URL);
  const connectionString = z
    .object({ CMS_MIGRATION_DATABASE_URL: environmentSchema.shape.DATABASE_URL })
    .parse({ CMS_MIGRATION_DATABASE_URL: selected }).CMS_MIGRATION_DATABASE_URL;
  requireDatabaseTls({ NODE_ENV: env.NODE_ENV, DATABASE_URL: connectionString });
  return { connectionString, schema: env.DATABASE_SCHEMA, maxConnections: 2 };
}

function clientOrigin(env: z.infer<typeof environmentSchema>): string {
  const value =
    env.ONEASTER_CLIENT_ORIGIN ??
    (env.NODE_ENV === 'production' ? undefined : 'http://localhost:9090');
  return z
    .object({
      ONEASTER_CLIENT_ORIGIN: z.url().refine((candidate) => {
        const url = new URL(candidate);
        return (
          url.origin === candidate &&
          !url.username &&
          !url.password &&
          (url.protocol === 'https:' ||
            (env.NODE_ENV !== 'production' &&
              url.protocol === 'http:' &&
              ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
        );
      }),
    })
    .parse({ ONEASTER_CLIENT_ORIGIN: value }).ONEASTER_CLIENT_ORIGIN;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): ApplicationConfig {
  const env = environmentSchema.parse(source);
  validateProduction(env);
  const contentOrigin = clientOrigin(env);
  return {
    delivery: {
      clientOrigin: contentOrigin,
      publicReadIpRateLimit: env.ONEASTER_PUBLIC_READ_IP_LIMIT,
    },
    storage: loadStorageConfig(source, env.NODE_ENV === 'production'),
    assetProcessingIntervalMs: env.CMS_ASSET_PROCESSING_INTERVAL_MS,
    mode: env.NODE_ENV,
    navigation: { paths: env.CMS_NAVIGATION_PATHS, icons: env.CMS_NAVIGATION_ICONS },
    database: {
      connectionString: env.DATABASE_URL,
      schema: env.DATABASE_SCHEMA,
      maxConnections: 10,
    },
    policy: {
      ...defaultPolicy(env.CMS_RATE_LIMIT_SECRET),
      cleanupIntervalMs: env.CMS_MAINTENANCE_INTERVAL_MS,
    },
    password: { N: 32768, r: 8, p: 3, saltBytes: 16, keyBytes: 64, maxmemBytes: 67_108_864 },
    http: {
      host: env.API_HOST,
      port: env.API_PORT,
      allowedHosts: commaList(env.API_ALLOWED_HOSTS),
      allowedOrigins: [...new Set([...commaList(env.API_ALLOWED_ORIGINS), contentOrigin])],
      bodyLimitBytes: 1_048_576,
      uploadBodyLimitBytes: 20_971_520,
      uploadTimeoutMs: 60_000,
      headerLimitBytes: 16_384,
      urlLimitBytes: 4096,
      requestTimeoutMs: 15_000,
      shutdownTimeoutMs: 10_000,
      maxRequests: 64,
    },
    smtp: smtpOptions(env),
  };
}

export function loadContentMigrationConfig(source: NodeJS.ProcessEnv = process.env) {
  const env = environmentSchema.pick({ CMS_RATE_LIMIT_SECRET: true }).parse(source);
  return {
    database: loadMigrationDatabaseConfig(source),
    policy: defaultPolicy(env.CMS_RATE_LIMIT_SECRET),
  };
}
