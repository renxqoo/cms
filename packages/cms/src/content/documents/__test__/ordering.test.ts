import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import { createContent } from '../../composition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(
  configure?: (definition: ReturnType<typeof workflowCollections>[number]) => void,
) {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Missing articles');
  article.orderable = true;
  delete article.defaultSort;
  configure?.(article);
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}
async function create(kit: ContentFixture, title: string) {
  return kit.content.api.createDocument(kit.owner(), { collection: 'articles', data: { title } });
}
async function order(kit: ContentFixture) {
  const result = await kit.content.api.getDocumentOrder(kit.owner(), { collection: 'articles' });
  if (!result.version) throw new Error('Expected order version');
  return result.version;
}
async function titles(kit: ContentFixture) {
  return (await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).rows.map(
    (row) => row.data['title'],
  );
}

it('persists ordered inserts, multi-document before/after moves, descending queries and filtered totals', async () => {
  const kit = await fixture();
  const { api } = kit.content;
  const initial = await api.getDocumentOrder(kit.owner(), { collection: 'articles' });
  expect(initial.version).toMatch(/^[0-9a-f-]{36}$/);
  expect(await api.getDocumentOrder(kit.owner(), { collection: 'articles' })).toEqual(initial);
  const a = await create(kit, 'Alpha');
  const b = await create(kit, 'Bravo');
  const c = await create(kit, 'Charlie');
  const d = await create(kit, 'Delta');
  const metadata = await api.getCollection(kit.owner(), { collection: 'articles' });
  expect(metadata).toMatchObject({
    orderable: true,
    defaultSort: [{ field: '_order', order: 'asc' }],
  });
  expect(await titles(kit)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  const before = await api.reorderDocuments(kit.owner(), {
    collection: 'articles',
    version: await order(kit),
    ids: [c.id, a.id],
    targetId: b.id,
    position: 'before',
  });
  expect(before.version).toBeTruthy();
  expect(await titles(kit)).toEqual(['Charlie', 'Alpha', 'Bravo', 'Delta']);
  const after = await api.reorderDocuments(kit.owner(), {
    collection: 'articles',
    version: before.version,
    ids: [c.id, a.id],
    targetId: d.id,
    position: 'after',
  });
  expect(after.version).not.toBe(before.version);
  expect(await titles(kit)).toEqual(['Bravo', 'Delta', 'Charlie', 'Alpha']);
  const descending = await api.listDocuments(kit.owner(), {
    collection: 'articles',
    sort: [{ field: '_order', order: 'desc' }],
  });
  expect(descending.rows.map((row) => row.id)).toEqual([a.id, c.id, d.id, b.id]);
  const filtered = await api.listDocuments(kit.owner(), {
    collection: 'articles',
    where: { field: 'title', operator: 'in', value: ['Alpha', 'Charlie'] },
    pageSize: 1,
    page: 2,
  });
  expect(filtered.total).toBe(2);
  expect(filtered.rows.map((row) => row.id)).toEqual([a.id]);
  expect(
    (
      await api.listDocuments(kit.owner(), {
        collection: 'articles',
        sort: [{ field: 'title', order: 'asc' }],
      })
    ).rows.map((row) => row.id),
  ).toEqual([a.id, b.id, c.id, d.id]);
  await expect(api.getDocumentOrder(kit.owner(), { collection: 'pages' })).rejects.toMatchObject({
    code: 'invalid_input',
  });
  await expect(
    api.listDocuments(kit.owner(), {
      collection: 'pages',
      sort: [{ field: '_order', order: 'asc' }],
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('rejects stale and concurrent reorder tokens and malformed moves without partial changes', async () => {
  const kit = await fixture();
  const a = await create(kit, 'Alpha');
  const b = await create(kit, 'Bravo');
  const c = await create(kit, 'Charlie');
  const version = await order(kit);
  const requests = [
    { collection: 'articles', version, ids: [a.id], targetId: c.id, position: 'after' },
    { collection: 'articles', version, ids: [c.id], targetId: a.id, position: 'before' },
  ];
  const result = await Promise.allSettled(
    requests.map((input) => kit.content.api.reorderDocuments(kit.owner(), input)),
  );
  expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  expect(result.find((item) => item.status === 'rejected')).toMatchObject({
    reason: { code: 'version_conflict' },
  });
  const current = await order(kit);
  await create(kit, 'New last');
  await expect(
    kit.content.api.reorderDocuments(kit.owner(), { ...requests[0], version: current }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  for (const ids of [[], [a.id, a.id], [b.id]])
    await expect(async () =>
      kit.content.api.reorderDocuments(kit.owner(), {
        collection: 'articles',
        version: await order(kit),
        ids,
        targetId: b.id,
        position: 'before',
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('regression: reorder cannot move hidden fallback-locale documents or bypass update and reorder row policies', async () => {
  const kit = await fixture((article) => {
    article.access = {
      'documents.list': {
        version: '1',
        run: ({ actor, locale }) => {
          if (actor.role.isSuper) return true;
          if (locale !== 'zh') return false;
          return { field: 'title', operator: 'ne', value: 'Hidden' };
        },
      },
      'documents.reorder': {
        version: '1',
        run: ({ actor }) =>
          actor.role.isSuper ? true : { field: 'title', operator: 'ne', value: 'Pinned' },
      },
      'documents.update': {
        version: '1',
        run: ({ actor }) =>
          actor.role.isSuper ? true : { field: 'title', operator: 'ne', value: 'Locked' },
      },
    };
  });
  const a = await create(kit, 'Alpha');
  const b = await create(kit, 'Bravo');
  const hidden = await create(kit, 'Hidden');
  const pinned = await create(kit, 'Pinned');
  const locked = await create(kit, 'Locked');
  const actor = await contentActor(kit, [
    'articles:documents.list',
    'articles:documents.order',
    'articles:documents.reorder',
    'articles:documents.update',
  ]);
  await expect(
    kit.content.api.getDocumentOrder(actor.ctx(), { collection: 'articles', locale: 'en' }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const state = await kit.content.api.getDocumentOrder(actor.ctx(), {
    collection: 'articles',
    locale: 'zh',
  });
  for (const [ids, targetId] of [
    [[hidden.id], b.id],
    [[pinned.id], b.id],
    [[locked.id], b.id],
    [[a.id], hidden.id],
  ] as [string[], string][])
    await expect(
      kit.content.api.reorderDocuments(actor.ctx(), {
        collection: 'articles',
        locale: 'zh',
        version: state.version,
        ids,
        targetId,
        position: 'before',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  await kit.content.api.reorderDocuments(actor.ctx(), {
    collection: 'articles',
    locale: 'zh',
    version: state.version,
    ids: [b.id],
    targetId: a.id,
    position: 'before',
  });
  expect((await titles(kit)).slice(0, 2)).toEqual(['Bravo', 'Alpha']);
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: actor.role.id,
    version: actor.role.version,
    permissionIds: [
      'articles:documents.list',
      'articles:documents.order',
      'articles:documents.reorder',
    ].map((key) => {
      const id = kit.permissionIds.get(key);
      if (!id) throw new Error('Missing permission');
      return id;
    }),
  });
  await expect(
    kit.content.api.reorderDocuments(actor.ctx(), {
      collection: 'articles',
      locale: 'zh',
      version: await order(kit),
      ids: [a.id],
      targetId: b.id,
      position: 'before',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('retains archived/restored positions, appends copies and invalidates the token on physical purge', async () => {
  const kit = await fixture();
  const a = await create(kit, 'Alpha');
  const b = await create(kit, 'Bravo');
  const archived = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: a.revision,
  });
  expect(await titles(kit)).toEqual(['Bravo']);
  await kit.content.api.restoreTrashedDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: archived.revision,
  });
  expect(await titles(kit)).toEqual(['Alpha', 'Bravo']);
  const copy = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'articles',
    id: b.id,
    revision: b.revision,
  });
  expect(
    (await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).rows.map(
      (row) => row.id,
    ),
  ).toEqual([a.id, b.id, copy.id]);
  const trash = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'articles',
    id: b.id,
    revision: b.revision,
  });
  const version = await order(kit);
  await kit.content.api.purgeDocument(kit.owner(), {
    collection: 'articles',
    id: b.id,
    revision: trash.revision,
  });
  expect(await order(kit)).not.toBe(version);
  expect(
    (await kit.database.query('SELECT 1 FROM content_document_order WHERE document_id=$1', [b.id]))
      .rowCount,
  ).toBe(0);
});

it('rolls back order and token when key capacity or audit persistence fails', async () => {
  const kit = await fixture();
  const a = await create(kit, 'Alpha');
  const b = await create(kit, 'Bravo');
  const version = await order(kit);
  const input = { collection: 'articles', version, ids: [a.id], targetId: b.id, position: 'after' };
  const limited = createContent({
    ...kit.contentOptions,
    workPolicy: { ...kit.contentOptions.workPolicy, maxOrderKeyBytes: 1 },
  });
  await expect(limited.api.reorderDocuments(kit.owner(), input)).rejects.toMatchObject({
    code: 'capacity_exceeded',
  });
  expect(await order(kit)).toBe(version);
  await kit.database.query(
    "CREATE FUNCTION reject_order_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_id='documents.reorder' THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_order_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_order_audit()",
  );
  await expect(kit.content.api.reorderDocuments(kit.owner(), input)).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  expect(await order(kit)).toBe(version);
  expect(await titles(kit)).toEqual(['Alpha', 'Bravo']);
});

it('moves many documents in input order within a fixed SQL request budget', async () => {
  const kit = await fixture();
  const documents = [];
  for (let index = 0; index < 25; index += 1) documents.push(await create(kit, `Item ${index}`));
  const target = documents.at(-1);
  if (!target) throw new Error('Missing target');
  const ids = documents.slice(0, -1).map((document) => document.id);
  const limited = createContent({
    ...kit.contentOptions,
    limits: { ...kit.limits, maxSqlQueries: 32 },
  });
  await limited.api.reorderDocuments(kit.owner(), {
    collection: 'articles',
    version: await order(kit),
    ids,
    targetId: target.id,
    position: 'after',
  });
  const page = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    pageSize: 100,
  });
  expect(page.rows.map((row) => row.id)).toEqual([target.id, ...ids]);
  expect(page.total).toBe(25);
});

it('rejects readiness when the sole order trigger or migration ledger is unavailable', async () => {
  const kit = await fixture();
  await kit.content.verifyReady();
  await kit.database.query(
    'ALTER TABLE content_documents DISABLE TRIGGER content_documents_track_order',
  );
  await expect(kit.content.verifyReady()).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  await kit.database.query(
    'ALTER TABLE content_documents ENABLE TRIGGER content_documents_track_order',
  );
  await kit.database.query("DELETE FROM cms_migrations WHERE name='0019_document_order.sql'");
  await expect(kit.content.verifyReady()).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
});

it('regression: empty and entirely hidden collections expose only stable opaque ordering versions', async () => {
  const collections = workflowCollections();
  const [article, page] = collections;
  if (!article || !page) throw new Error('Missing collections');
  article.orderable = true;
  page.orderable = true;
  article.access = {
    'documents.list': {
      version: '1',
      run: ({ actor }) =>
        actor.role.isSuper ? true : { field: 'title', operator: 'ne', value: 'Hidden' },
    },
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  await create(kit, 'Hidden');
  const actor = await contentActor(kit, [
    'articles:documents.order',
    'articles:documents.list',
    'pages:documents.order',
    'pages:documents.list',
  ]);
  const hidden = await kit.content.api.getDocumentOrder(actor.ctx(), { collection: 'articles' });
  const empty = await kit.content.api.getDocumentOrder(actor.ctx(), { collection: 'pages' });
  expect(hidden.version).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(empty.version).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(await kit.content.api.getDocumentOrder(actor.ctx(), { collection: 'pages' })).toEqual(
    empty,
  );
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'First page' },
  });
  expect(await kit.content.api.getDocumentOrder(actor.ctx(), { collection: 'pages' })).not.toEqual(
    empty,
  );
  expect(await kit.content.api.getDocumentOrder(actor.ctx(), { collection: 'articles' })).toEqual(
    hidden,
  );
});
