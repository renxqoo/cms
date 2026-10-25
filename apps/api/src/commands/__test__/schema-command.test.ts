import { expect, it, vi } from 'vitest';
import { executeSchemaCommand, parseSchemaCommand } from '../schema-command.ts';
import { loadContentMigrationConfig } from '../../bootstrap/load-config.ts';

const limits = { defaultPageSize: 20, maxPageSize: 100, maxPages: 1000 };
const args = ['--collection', 'articles', '--from', '1', '--to', '2'];
const cursor = '10000000-0000-4000-8000-000000000001';
type Migrator = Parameters<typeof executeSchemaCommand>[0];
function migrator() {
  return {
    backfill: vi
      .fn<Migrator['backfill']>()
      .mockResolvedValue({ processed: 0, cursor: null, complete: true }),
    activate: vi
      .fn<Migrator['activate']>()
      .mockResolvedValue({ fingerprint: 'a'.repeat(64), collections: ['articles'] }),
  };
}
it('accepts an explicit bounded backfill or activation, and rejects mixed or duplicated flags', () => {
  expect(parseSchemaCommand(args, limits)).toEqual({
    kind: 'backfill',
    collection: 'articles',
    from: 1,
    to: 2,
    pageSize: 20,
    maxPages: 1000,
  });
  expect(
    parseSchemaCommand(
      [...args, '--page-size', '5', '--max-pages', '3', '--cursor', cursor],
      limits,
    ),
  ).toMatchObject({ pageSize: 5, maxPages: 3, cursor });
  expect(parseSchemaCommand(['--activate'], limits)).toEqual({ kind: 'activate' });
  for (const invalid of [
    [],
    ['articles'],
    ['--collection'],
    [...args, '--activate'],
    [...args, '--from', '1'],
    [...args, '--unknown', '1'],
    [...args, '--page-size', '101'],
    [...args, '--max-pages', '0'],
    [...args, '--cursor', 'bad'],
  ])
    expect(() => parseSchemaCommand(invalid, limits)).toThrowError(Error);
  expect(() =>
    parseSchemaCommand(['--collection', 'articles', '--from', '2', '--to', '2'], limits),
  ).toThrow('Target schema must be newer');
});
it('stops at the page budget and reports a resumable incomplete result without activating the schema', async () => {
  const service = migrator();
  service.backfill.mockResolvedValue({ processed: 5, cursor, complete: false });
  const reports: unknown[] = [];
  const result = await executeSchemaCommand(
    service,
    parseSchemaCommand([...args, '--max-pages', '2'], limits),
    { signal: new AbortController().signal, report: (value) => reports.push(value) },
  );
  expect(result).toEqual({ complete: false });
  expect(reports).toEqual([
    { type: 'backfillPage', processed: 5, cursor, complete: false, processedTotal: 5 },
    { type: 'backfillPage', processed: 5, cursor, complete: false, processedTotal: 10 },
  ]);
  expect(service.backfill).toHaveBeenCalledTimes(2);
  expect(service.backfill).toHaveBeenLastCalledWith(expect.objectContaining({ cursor }));
  expect(service.activate).not.toHaveBeenCalled();
});
it('stops after database-confirmed completion and checks cancellation between committed pages', async () => {
  const service = migrator();
  const controller = new AbortController();
  const command = parseSchemaCommand(args, limits);
  await expect(
    executeSchemaCommand(service, command, { signal: controller.signal, report() {} }),
  ).resolves.toEqual({ complete: true });
  expect(service.backfill).toHaveBeenCalledTimes(1);
  service.backfill.mockClear().mockResolvedValue({ processed: 1, cursor: null, complete: false });
  await expect(
    executeSchemaCommand(service, command, {
      signal: controller.signal,
      report: () => controller.abort(new Error('Operator cancelled')),
    }),
  ).rejects.toThrow('Operator cancelled');
  expect(service.backfill).toHaveBeenCalledTimes(1);
  const aborted = migrator();
  await expect(
    executeSchemaCommand(aborted, command, { signal: controller.signal, report() {} }),
  ).rejects.toThrow('Operator cancelled');
  expect(aborted.backfill).not.toHaveBeenCalled();
});
it('activation is explicit, emits its committed identity and propagates a failed activation', async () => {
  const service = migrator();
  const report = vi.fn<(value: unknown) => void>();
  const command = parseSchemaCommand(['--activate'], limits);
  await expect(
    executeSchemaCommand(service, command, { signal: new AbortController().signal, report }),
  ).resolves.toEqual({ complete: true });
  expect(report).toHaveBeenCalledWith({
    type: 'activated',
    fingerprint: 'a'.repeat(64),
    collections: ['articles'],
  });
  expect(service.backfill).not.toHaveBeenCalled();
  service.activate.mockRejectedValue(new Error('Tail revisions remain'));
  await expect(
    executeSchemaCommand(service, command, { signal: new AbortController().signal, report }),
  ).rejects.toThrow('Tail revisions remain');
  expect(report).toHaveBeenCalledTimes(1);
});
it('schema maintenance loads database and security policy without requiring a storage or SMTP provider', () => {
  const source = {
    DATABASE_URL: 'postgresql://runtime@localhost/cms?sslmode=verify-full',
    CMS_MIGRATION_DATABASE_URL: 'postgresql://owner@localhost/cms?sslmode=verify-full',
    CMS_RATE_LIMIT_SECRET: 's'.repeat(32),
    NODE_ENV: 'production',
  };
  expect(loadContentMigrationConfig(source)).toMatchObject({
    database: {
      connectionString: source.CMS_MIGRATION_DATABASE_URL,
      schema: 'public',
      maxConnections: 2,
    },
    policy: { securityLockKey: 1171904221 },
  });
  expect(() =>
    loadContentMigrationConfig({ ...source, CMS_MIGRATION_DATABASE_URL: undefined }),
  ).toThrowError(Error);
  expect(() => loadContentMigrationConfig({ ...source, CMS_RATE_LIMIT_SECRET: '' })).toThrowError(
    Error,
  );
  expect(() =>
    loadContentMigrationConfig({
      ...source,
      CMS_MIGRATION_DATABASE_URL: 'postgresql://localhost/cms',
    }),
  ).toThrow('Verified PostgreSQL TLS');
});
