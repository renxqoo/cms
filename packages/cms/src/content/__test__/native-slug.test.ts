import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(custom = false) {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.label = 'Article';
  articles.fields = [
    ...articles.fields.filter((field) => field.name !== 'slug'),
    {
      id: 'slug',
      name: 'slug',
      type: 'slug',
      useAsSlug: 'title',
      ...(custom
        ? {
            slugify: {
              version: 'custom',
              run: ({ valueToSlugify }: { valueToSlugify: string }) =>
                valueToSlugify.trim().toLowerCase().replaceAll(' ', '_'),
            },
          }
        : {}),
    },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}

it('generates unique slugs, preserves stored slugs on source edits or empty autosaves and rejects an explicit collision', async () => {
  const kit = await fixture();
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Hello World!' },
  });
  expect(first.data['slug']).toBe('hello-world');
  const second = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Hello World!' },
  });
  expect(second.data['slug']).toBe('hello-world-1');
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Explicit', slug: 'Hello World!' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input', fieldErrors: [{ field: 'slug' }] });
  const saved = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    data: { title: 'New title', slug: '' },
  });
  expect(saved.data['slug']).toBe('hello-world');
  const autosaved = await kit.content.api.autosaveDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: saved.revision,
    data: { slug: null },
  });
  expect(autosaved.data['slug']).toBe('hello-world');
  expect(
    (
      await kit.content.api.listDocuments(kit.owner(), {
        collection: 'articles',
        where: { field: 'slug', operator: 'eq', value: 'hello-world' },
      })
    ).rows.map((row) => row.id),
  ).toEqual([first.id]);
});

it('gives copies a fresh fallback slug and supports custom versioned slugification and manual values', async () => {
  const kit = await fixture(true);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Custom value' },
  });
  expect(first.data['slug']).toBe('custom_value');
  const copy = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
  });
  expect(copy.data['slug']).toBe('article-1');
  const copied = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    data: { slug: 'Manual copy' },
  });
  expect(copied.data['slug']).toBe('manual_copy');
  const read = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: first.id,
    versionId: first.versionId,
  });
  expect(read.data['slug']).toBe('custom_value');
});
