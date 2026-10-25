import { resolve } from 'node:path';
import { z } from 'zod';

const storageEnvironment = z
  .object({
    CMS_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    CMS_STORAGE_ROOT: z.string().min(1).default('.data/assets'),
    CMS_S3_BUCKET: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/)
      .optional(),
    CMS_S3_REGION: z.string().min(1).max(128).optional(),
    CMS_S3_ENDPOINT: z.url().optional(),
    CMS_S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
  })
  .superRefine((env, ctx) => {
    if (env.CMS_STORAGE_DRIVER !== 's3') return;
    for (const key of ['CMS_S3_BUCKET', 'CMS_S3_REGION'] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'Required for shared storage' });
    }
  });

export type StorageConfig =
  | { kind: 'local'; root: string }
  | { kind: 's3'; bucket: string; region: string; endpoint?: string; forcePathStyle: boolean };

function storageSource(source: NodeJS.ProcessEnv) {
  const optional = new Set([
    'CMS_STORAGE_DRIVER',
    'CMS_S3_BUCKET',
    'CMS_S3_REGION',
    'CMS_S3_ENDPOINT',
    'CMS_S3_FORCE_PATH_STYLE',
  ]);
  const values = Object.fromEntries(
    Object.entries(source).filter(([name, value]) => !optional.has(name) || value?.trim() !== ''),
  );
  const driver =
    values['CMS_STORAGE_DRIVER'] ??
    (values['CMS_S3_BUCKET'] || values['CMS_S3_REGION'] || values['CMS_S3_ENDPOINT']
      ? 's3'
      : 'local');
  return driver === 'local'
    ? { CMS_STORAGE_DRIVER: driver, CMS_STORAGE_ROOT: values['CMS_STORAGE_ROOT'] }
    : { ...values, CMS_STORAGE_DRIVER: driver };
}

export function loadStorageConfig(source: NodeJS.ProcessEnv, production: boolean): StorageConfig {
  const env = storageEnvironment.parse(storageSource(source));
  if (env.CMS_STORAGE_DRIVER === 'local') {
    return { kind: 'local', root: resolve(env.CMS_STORAGE_ROOT) };
  }
  const bucket = z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/)
    .parse(env.CMS_S3_BUCKET);
  const region = z.string().min(1).parse(env.CMS_S3_REGION);
  const endpoint = env.CMS_S3_ENDPOINT;
  if (production && endpoint && new URL(endpoint).protocol !== 'https:') {
    throw new Error('HTTPS object storage is required in production');
  }
  return {
    kind: 's3',
    bucket,
    region,
    forcePathStyle: env.CMS_S3_FORCE_PATH_STYLE === 'true',
    ...(endpoint ? { endpoint } : {}),
  };
}
