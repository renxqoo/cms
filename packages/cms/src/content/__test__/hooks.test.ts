import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  contentCollection,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(collections = workflowCollections()) {
  const kit = await createContentFixture({ collections, trashRetentionMs: 0 });
  fixtures.push(kit);
  return kit;
}

it('regression: write hooks persist normalized values while afterRead only transforms the authorized response', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.hooks = {
    beforeValidate: [
      {
        version: 'trim',
        run: ({ data }) => ({
          ...data,
          title: typeof data['title'] === 'string' ? data['title'].trim() : '',
        }),
      },
    ],
    beforeChange: [
      {
        version: 'slug',
        run: ({ data }) => ({
          ...data,
          slug: typeof data['title'] === 'string' ? data['title'].toLowerCase() : '',
        }),
      },
    ],
    afterRead: [
      {
        version: 'display',
        run: ({ data }) => ({
          ...data,
          title: `Display: ${typeof data['title'] === 'string' ? data['title'] : ''}`,
        }),
      },
    ],
  };
  article.fields = article.fields.map((field) =>
    field.name === 'score'
      ? {
          ...field,
          hooks: {
            beforeChange: [
              {
                version: 'increment',
                run: ({ value }) => (typeof value === 'number' ? value + 1 : 1),
              },
            ],
          },
        }
      : field,
  );
  const kit = await fixture(collections);
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: '  Story  ', score: 3 },
  });
  expect(created.data).toMatchObject({ title: 'Display: Story', slug: 'story', score: 4 });
  const page = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    where: { field: 'title', operator: 'eq', value: 'Story' },
  });
  expect(page.total).toBe(1);
  expect(page.rows[0]?.data['title']).toBe('Display: Story');
});

it('regression: afterChange failure rolls back documents, revisions, audit and idempotency together', async () => {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').hooks = {
    afterChange: [
      {
        version: 'reject',
        run: () => {
          throw new Error('private validation detail');
        },
      },
    ],
  };
  const kit = await fixture(collections);
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Rejected' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    0,
  );
  expect((await kit.database.query('SELECT 1 FROM content_revisions')).rowCount).toBe(0);
  expect(
    (await kit.database.query("SELECT 1 FROM audit_events WHERE operation_id='documents.create'"))
      .rowCount,
  ).toBe(0);
  expect(
    (
      await kit.database.query(
        "SELECT 1 FROM idempotency_records WHERE operation_id='documents.create'",
      )
    ).rowCount,
  ).toBe(0);
});

it('regression: hooks cannot write a field denied by the final field policy or leak it after reading', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.fields = [
    ...article.fields,
    {
      id: 'secret',
      name: 'secret',
      type: 'text',
      access: {
        read: { version: 'hidden', run: () => false },
        write: { version: 'locked', run: () => false },
      },
    },
  ];
  article.hooks = {
    beforeChange: [{ version: 'inject', run: ({ data }) => ({ ...data, secret: 'private' }) }],
  };
  const kit = await fixture(collections);
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Unauthorized' },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    0,
  );
});

it('regression: beforeRead only narrows collection access predicates and list totals', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.access = {
    'documents.list': {
      version: 'scope',
      run: () => ({ field: 'score', operator: 'gte', value: 2 }),
    },
  };
  article.hooks = {
    beforeRead: [
      { version: 'visible', run: () => ({ field: 'title', operator: 'eq', value: 'Visible' }) },
    ],
  };
  const kit = await fixture(collections);
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Visible', score: 1 },
  });
  const included = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Visible', score: 2 },
  });
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Other', score: 3 },
  });
  const page = await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' });
  expect(page.total).toBe(1);
  expect(page.rows.map((row) => row.id)).toEqual([included.id]);
});

it('regression: hook contexts are immutable and afterError sees only a safe code while the operation still fails', async () => {
  const collections = workflowCollections();
  const errors: unknown[] = [];
  contentCollection(collections, 'articles').hooks = {
    beforeChange: [
      {
        version: 'mutates',
        run: ({ data }) => {
          data['title'] = 'Mutated';
          return data;
        },
      },
    ],
    afterError: [
      {
        version: 'observe',
        run: (context) => {
          errors.push({ code: context.errorCode, data: context.data });
        },
      },
    ],
  };
  const kit = await fixture(collections);
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Original' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(errors).toEqual([{ code: 'invalid_input', data: undefined }]);
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    0,
  );
});

it('regression: asynchronous hook rejection rolls back without emitting an unhandled rejection', async () => {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').hooks = {
    beforeOperation: [{ version: 'promise', run: () => Promise.reject(new Error('async secret')) }],
  };
  const kit = await fixture(collections);
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Rejected' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect((await kit.database.query('SELECT 1 FROM content_documents')).rowCount).toBe(0);
});
