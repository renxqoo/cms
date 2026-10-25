import { expect, it } from 'vitest';
import { contentInputSchemas } from '../input-schemas.ts';

const schemas = contentInputSchemas({
  defaultPageSize: 20,
  maxPageSize: 100,
  maxBatchItems: 1000,
  maxLocales: 20,
  maxFields: 100,
  maxQueryNodes: 100,
});
const target = { collection: 'articles', id: 'a5f54703-b924-4cdb-9aca-55c43086b145', revision: 1 };

it('requires a real patch and rejects client controlled server metadata', () => {
  expect(schemas['documents.update'].safeParse(target).success).toBe(false);
  expect(
    schemas['documents.update'].safeParse({ ...target, data: {}, publishedVersionId: target.id })
      .success,
  ).toBe(false);
  expect(schemas['documents.update'].safeParse({ ...target, uploadId: target.id }).success).toBe(
    true,
  );
  expect(schemas['documents.update'].safeParse({ ...target, folderId: null }).success).toBe(true);
});

it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'])(
  'rejects an invalid edit revision %s',
  (revision) => {
    expect(schemas['documents.publish'].safeParse({ ...target, revision }).success).toBe(false);
  },
);

it('rejects manifest IDs supplied as upload authorization', () => {
  expect(
    schemas['documents.create'].safeParse({ collection: 'media', data: {}, manifestId: target.id })
      .success,
  ).toBe(false);
  expect(
    schemas['documents.create'].safeParse({ collection: 'media', data: {}, uploadId: target.id })
      .success,
  ).toBe(true);
});

it('bounds page sizes and preserves independent published read selection', () => {
  expect(
    schemas['documents.list'].parse({ collection: 'articles', mode: 'published' }),
  ).toMatchObject({ mode: 'published', page: 1, pageSize: 20, trashed: false });
  expect(
    schemas['documents.list'].safeParse({ collection: 'articles', pageSize: 101 }).success,
  ).toBe(false);
  expect(
    schemas['documents.get'].safeParse({ collection: 'articles', id: target.id, mode: 'latest' })
      .success,
  ).toBe(false);
});

it('rejects empty batch work and unknown actions instead of accepting fake work', () => {
  expect(
    schemas['content.batch'].safeParse({ collection: 'articles', action: 'archive', items: [] })
      .success,
  ).toBe(false);
  expect(
    schemas['content.batch'].safeParse({ collection: 'articles', action: 'purge', items: [target] })
      .success,
  ).toBe(false);
});

it('requires timezone and fixed revision for publication schedules', () => {
  expect(
    schemas['content.schedulePublication'].safeParse({
      ...target,
      versionId: target.id,
      executeAt: '2026-10-26T12:00:00',
    }).success,
  ).toBe(false);
  expect(
    schemas['content.schedulePublication'].safeParse({
      ...target,
      versionId: target.id,
      executeAt: '2026-10-26T12:00:00Z',
    }).success,
  ).toBe(true);
});
