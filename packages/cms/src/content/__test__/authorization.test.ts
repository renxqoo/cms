import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../test/support/content-actor.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(options: Parameters<typeof createContentFixture>[0] = {}) {
  const kit = await createContentFixture(options);
  fixtures.push(kit);
  return kit;
}

it('applies the same collection predicate to rows, total, details and edits', async () => {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Missing articles');
  const policy = {
    version: '1',
    run: (context: { actor: { role: { isSuper: boolean } } }) =>
      context.actor.role.isSuper || {
        field: 'score' as const,
        operator: 'gte' as const,
        value: 10,
      },
  };
  article.access = {
    'documents.list': policy,
    'documents.get': policy,
    'documents.update': policy,
  };
  const kit = await fixture({ collections });
  const visible = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Visible', score: 10 },
  });
  const hidden = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Hidden', score: 9 },
  });
  const editor = await contentActor(kit, [
    'articles:documents.list',
    'articles:documents.get',
    'articles:documents.update',
  ]);
  const page = await kit.content.api.listDocuments(editor.ctx(), { collection: 'articles' });
  expect(page.total).toBe(1);
  expect(page.rows.map((row) => row.id)).toEqual([visible.id]);
  await expect(
    kit.content.api.getDocument(editor.ctx(), { collection: 'articles', id: hidden.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.content.api.updateDocument(editor.ctx(), {
      collection: 'articles',
      id: hidden.id,
      revision: 1,
      data: { title: 'Attack' },
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.content.api.getDocument(editor.ctx(), { collection: 'pages', id: visible.id }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('prevents private fields from being inferred through filters, sorting, metadata or diffs', async () => {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Missing articles');
  article.fields = [
    ...article.fields,
    {
      id: 'secret',
      name: 'secret',
      type: 'text',
      access: {
        read: { version: '1', run: ({ actor }) => actor.role.isSuper },
        write: { version: '1', run: ({ actor }) => actor.role.isSuper },
      },
    },
  ];
  const kit = await fixture({ collections });
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'One', secret: 'Private one' },
  });
  const second = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: 1,
    data: { title: 'Two', secret: 'Private two' },
  });
  const editor = await contentActor(kit, [
    'articles:documents.list',
    'articles:documents.get',
    'articles:documents.update',
    'articles:collections.get',
    'articles:versions.diff',
  ]);
  const view = await kit.content.api.getDocument(editor.ctx(), {
    collection: 'articles',
    id: first.id,
  });
  expect(view.data).toEqual({ title: 'Two' });
  await expect(
    kit.content.api.listDocuments(editor.ctx(), {
      collection: 'articles',
      where: { field: 'secret', operator: 'eq', value: 'Private two' },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.listDocuments(editor.ctx(), {
      collection: 'articles',
      sort: [{ field: 'secret', order: 'asc' }],
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.updateDocument(editor.ctx(), {
      collection: 'articles',
      id: first.id,
      revision: 2,
      data: { secret: 'Attack' },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const metadata = await kit.content.api.getCollection(editor.ctx(), { collection: 'articles' });
  expect(JSON.stringify(metadata)).not.toContain('secret');
  const diff = await kit.content.api.compareVersions(editor.ctx(), {
    collection: 'articles',
    id: first.id,
    from: first.versionId,
    to: second.versionId,
  });
  expect(diff.changes).toEqual([{ field: 'title', before: 'One', after: 'Two' }]);
});

it('denies a previously accepted publication after the initiating role loses publication permission', async () => {
  const kit = await fixture();
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Keep draft' },
  });
  const grants = [
    'articles:content.schedulePublication',
    'articles:documents.publish',
    'articles:documents.get',
  ];
  const editor = await contentActor(kit, grants);
  const job = await kit.content.api.schedulePublication(editor.ctx(), {
    collection: 'articles',
    id: draft.id,
    revision: 1,
    versionId: draft.versionId,
    executeAt: new Date(Date.now() + 60000).toISOString(),
  });
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: editor.role.id,
    version: editor.role.version,
    permissionIds: grants
      .filter((key) => key !== 'articles:documents.publish')
      .map((key) => kit.permissionIds.get(key)),
  });
  await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
    job.jobId,
  ]);
  await kit.content.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: job.jobId }),
  ).toMatchObject({
    status: 'failed',
    items: [{ status: 'failed', error: { code: 'forbidden' } }],
  });
  await expect(
    kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      mode: 'published',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('does not replay a successful idempotent create after its operation is revoked', async () => {
  const kit = await fixture();
  const editor = await contentActor(kit, ['articles:documents.create']);
  const ctx = editor.ctx();
  const input = { collection: 'articles', data: { title: 'Own draft' } };
  const first = await kit.content.api.createDocument(ctx, input);
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: editor.role.id,
    version: editor.role.version,
    permissionIds: [],
  });
  await expect(kit.content.api.createDocument(ctx, input)).rejects.toMatchObject({
    code: 'forbidden',
  });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: first.id })).data[
      'title'
    ],
  ).toBe('Own draft');
});
