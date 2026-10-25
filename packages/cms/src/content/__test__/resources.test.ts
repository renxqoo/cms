import { afterEach, expect, it } from 'vitest';
import { createContent } from '../composition.ts';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
  contentField,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import {
  createContentMediaFixture,
  mediaCollections,
  readyContentUpload,
} from '../../../../../test/support/content-media-runtime.ts';
import { contentActor } from '../../../../../test/support/content-actor.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

it('lists only readable collection metadata and rejects document Where policies on folder or metadata resources', async () => {
  const collections = workflowCollections();
  contentField(contentCollection(collections, 'articles'), 'score').access = {
    read: { version: '1', run: ({ actor }) => actor.role.isSuper },
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const editor = await contentActor(kit, ['articles:collections.get']);
  const page = await kit.content.api.listCollections(editor.ctx(), {});
  expect(page.rows).toMatchObject([{ key: 'articles' }]);
  expect(JSON.stringify(page)).not.toContain('score');
  expect(page.rows[0]?.capabilities).toMatchObject({
    autosave: true,
    publication: true,
    history: true,
  });
  const unsupported = workflowCollections();
  contentCollection(unsupported, 'articles').access = {
    'folders.list': { version: '1', run: () => ({ field: 'score', operator: 'eq', value: 1 }) },
    'collections.get': { version: '1', run: () => ({ field: 'score', operator: 'eq', value: 1 }) },
  };
  const second = await createContentFixture({ collections: unsupported });
  fixtures.push(second);
  await expect(
    second.content.api.listFolders(second.owner(), { collection: 'articles' }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(second.content.api.listCollections(second.owner(), {})).rejects.toMatchObject({
    code: 'invalid_input',
  });
  await expect(
    second.content.api.getCollection(second.owner(), { collection: 'articles' }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('pages a global resource list across media collections while excluding unreadable collection scopes', async () => {
  const collections = mediaCollections();
  const media = contentCollection(collections, 'media');
  collections.push({ ...media, id: 'workflow_photos', key: 'photos', label: 'Photos' });
  const kit = await createContentMediaFixture({ collections });
  fixtures.push(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    uploadId: (await readyContentUpload(kit)).uploadId,
    data: { title: 'Media one' },
  });
  const second = await kit.content.api.createDocument(kit.owner(), {
    collection: 'photos',
    uploadId: (await readyContentUpload(kit, { collection: 'photos' })).uploadId,
    data: { title: 'Photo one' },
  });
  const sort = [{ field: 'id', order: 'asc' }];
  const page1 = await kit.content.api.listResources(kit.owner(), {
    page: 1,
    pageSize: 1,
    sort,
    select: ['title'],
    depth: 1,
  });
  const page2 = await kit.content.api.listResources(kit.owner(), { page: 2, pageSize: 1, sort });
  expect([page1.rows[0]?.id, page2.rows[0]?.id]).toEqual([first.id, second.id].toSorted());
  expect(page1.total).toBe(2);
  expect(page2.total).toBe(2);
  const editor = await contentActor(kit, [
    'media:documents.list',
    'media:documents.get',
    'media:assets.download',
  ]);
  const filtered = await kit.content.api.listResources(editor.ctx(), {});
  expect(filtered.total).toBe(1);
  expect(filtered.rows[0]?.id).toBe(first.id);
  expect(filtered.rows[0]?.file?.filename).toBe('original.pdf');
  const uploadJob = await readyContentUpload(kit);
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'media', jobId: uploadJob.jobId }),
  ).toMatchObject({ status: 'succeeded' });
  await expect(
    kit.content.api.listResources(kit.owner(), { sort: [{ field: 'title', order: 'asc' }] }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('filters historical inbound references by source language, history permission and field projection', async () => {
  const collections = workflowCollections();
  let reveal = true;
  const pages = contentCollection(collections, 'pages');
  pages.access = {
    'documents.get': {
      version: '1',
      run: ({ actor, locale }) => actor.role.isSuper || locale === 'en',
    },
  };
  contentField(pages, 'author').access = {
    read: { version: '1', run: ({ actor }) => actor.role.isSuper || reveal },
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Target' },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Source', author: { collection: 'articles', id: target.id } },
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'pages',
    id: source.id,
    revision: source.revision,
    data: { author: null },
  });
  const grants = [
    'articles:resources.references',
    'articles:documents.get',
    'pages:documents.get',
    'pages:versions.get',
  ];
  const editor = await contentActor(kit, grants);
  const query = { collection: 'articles', id: target.id };
  const references = await kit.content.api.listReferences(editor.ctx(), query);
  expect(references.total).toBe(1);
  expect(references.rows).toEqual([
    { collection: 'pages', id: source.id, versionId: source.versionId, sourcePath: 'en:author' },
  ]);
  reveal = false;
  expect((await kit.content.api.listReferences(editor.ctx(), query)).total).toBe(0);
  reveal = true;
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: editor.role.id,
    version: editor.role.version,
    permissionIds: grants
      .filter((key) => key !== 'pages:versions.get')
      .map((key) => kit.permissionIds.get(key)),
  });
  expect((await kit.content.api.listReferences(editor.ctx(), query)).total).toBe(0);
});

it('enforces response budgets on document, metadata and global resource output', async () => {
  const kit = await createContentFixture();
  fixtures.push(kit);
  const doc = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Content' },
  });
  const bounded = createContent({
    ...kit.contentOptions,
    limits: { ...kit.limits, maxResponseBytes: 2 },
  });
  try {
    await expect(
      bounded.api.getDocument(kit.owner(), { collection: 'articles', id: doc.id }),
    ).rejects.toMatchObject({ code: 'capacity_exceeded' });
    await expect(bounded.api.listCollections(kit.owner(), {})).rejects.toMatchObject({
      code: 'capacity_exceeded',
    });
    await expect(bounded.api.listResources(kit.owner(), {})).rejects.toMatchObject({
      code: 'capacity_exceeded',
    });
  } finally {
    await bounded.close();
  }
});
