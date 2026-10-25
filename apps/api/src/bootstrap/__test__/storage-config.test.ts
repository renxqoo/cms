import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { loadStorageConfig } from '../storage-config.ts';
import { startupFailure } from '../startup-error.ts';

it('defaults to private local storage when S3 is unconfigured in development and production', () => {
  expect(loadStorageConfig({}, false)).toEqual({ kind: 'local', root: resolve('.data/assets') });
  expect(loadStorageConfig({ CMS_STORAGE_ROOT: '/tmp/private-cms' }, false)).toEqual({
    kind: 'local',
    root: '/tmp/private-cms',
  });
  expect(loadStorageConfig({}, true)).toEqual({ kind: 'local', root: resolve('.data/assets') });
  expect(
    loadStorageConfig({ CMS_STORAGE_DRIVER: 'local', CMS_STORAGE_ROOT: '/tmp/private-cms' }, true),
  ).toEqual({ kind: 'local', root: '/tmp/private-cms' });
});

it('selects configured S3 automatically and treats empty S3 settings as unconfigured', () => {
  expect(
    loadStorageConfig({ CMS_S3_BUCKET: 'cms-private', CMS_S3_REGION: 'ap-southeast-1' }, true),
  ).toMatchObject({ kind: 's3', bucket: 'cms-private', region: 'ap-southeast-1' });
  expect(
    loadStorageConfig({ CMS_S3_BUCKET: '', CMS_S3_REGION: ' ', CMS_S3_ENDPOINT: '' }, true),
  ).toEqual({ kind: 'local', root: resolve('.data/assets') });
  expect(() => loadStorageConfig({ CMS_S3_BUCKET: 'cms-private' }, false)).toThrow('CMS_S3_REGION');
  expect(
    loadStorageConfig(
      {
        CMS_STORAGE_DRIVER: 'local',
        CMS_S3_BUCKET: 'cms-private',
        CMS_S3_REGION: 'ap-southeast-1',
      },
      true,
    ).kind,
  ).toBe('local');
  expect(
    loadStorageConfig(
      { CMS_STORAGE_DRIVER: 'local', CMS_S3_BUCKET: 'invalid', CMS_S3_ENDPOINT: 'invalid-url' },
      true,
    ).kind,
  ).toBe('local');
});

it('requires shared storage identity and rejects insecure production endpoints', () => {
  const options = {
    CMS_STORAGE_DRIVER: 's3',
    CMS_S3_BUCKET: 'cms-private',
    CMS_S3_REGION: 'ap-southeast-1',
  };
  expect(loadStorageConfig(options, true)).toEqual({
    kind: 's3',
    bucket: 'cms-private',
    region: 'ap-southeast-1',
    forcePathStyle: false,
  });
  expect(() =>
    loadStorageConfig({ ...options, CMS_S3_ENDPOINT: 'http://storage.test' }, true),
  ).toThrow('HTTPS');
  expect(
    loadStorageConfig(
      { ...options, CMS_S3_ENDPOINT: 'http://127.0.0.1:9000', CMS_S3_FORCE_PATH_STYLE: 'true' },
      false,
    ),
  ).toMatchObject({ endpoint: 'http://127.0.0.1:9000', forcePathStyle: true });
  expect(() => loadStorageConfig({ ...options, CMS_S3_FORCE_PATH_STYLE: 'yes' }, false)).toThrow(
    'CMS_S3_FORCE_PATH_STYLE',
  );
});

it('names missing S3 configuration without exposing storage credentials in diagnostics', () => {
  let failure: unknown;
  try {
    loadStorageConfig({ CMS_STORAGE_DRIVER: 's3' }, false);
  } catch (error) {
    failure = error;
  }
  const message = startupFailure(failure);
  expect(message).toContain('CMS_S3_BUCKET');
  expect(message).toContain('CMS_S3_REGION');
  expect(() => loadStorageConfig({ CMS_STORAGE_DRIVER: 'unsupported' }, false)).toThrow(
    'CMS_STORAGE_DRIVER',
  );
});
