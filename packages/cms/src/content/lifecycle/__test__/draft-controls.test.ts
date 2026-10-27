import { afterEach, expect, it } from 'vitest';
import { createContent } from '../../composition.ts';
import { compileContent, createRegistry } from '../../generate.ts';
import { contentOperations } from '../../operations.ts';
import { assetsOperations } from '@new-cms/cms/assets';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import type { CollectionDefinition } from '../../definition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(
  drafts?: CollectionDefinition['drafts'],
  change?: (definition: CollectionDefinition) => void,
) {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  delete article.drafts;
  if (drafts) article.drafts = drafts;
  change?.(article);
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}
function configured(kit: ContentFixture, drafts: NonNullable<CollectionDefinition['drafts']>) {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').drafts = drafts;
  const registry = createRegistry({
    collections,
    limits: kit.limits,
    operations: [...contentOperations, ...assetsOperations],
  });
  return createContent({ ...kit.contentOptions, registry, mapping: compileContent(registry) });
}
it('disables autosave and scheduling by default while retaining immediate publication and complete publication validation', async () => {
  const kit = await fixture();
  const collection = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
  expect(collection).toMatchObject({
    drafts: { validate: false, autosave: false, schedule: false },
    capabilities: { autosave: false, schedules: false, publication: true },
  });
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: {},
  });
  await expect(
    kit.content.api.autosaveDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      revision: draft.revision,
      data: { title: 'Autosave' },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.getEditor(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      intent: 'autosave',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.schedulePublication(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      revision: draft.revision,
      versionId: draft.versionId,
      executeAt: new Date(Date.now() + 60000).toISOString(),
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      revision: draft.revision,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const valid = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: draft.revision,
    data: { title: 'Ready' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: valid.revision,
  });
  expect(published.publishedVersionId).toBe(valid.versionId);
});
it('compiles true autosave to the configured default and exposes an explicit interval without a second client default', async () => {
  const kit = await fixture({ autosave: true });
  expect(
    (await kit.content.api.getCollection(kit.owner(), { collection: 'articles' })).drafts?.autosave,
  ).toEqual({ intervalMs: 2000 });
  const next = configured(kit, { autosave: { intervalMs: 725 }, schedule: true });
  try {
    expect((await next.api.getCollection(kit.owner(), { collection: 'articles' })).drafts).toEqual({
      validate: false,
      autosave: { intervalMs: 725 },
      schedule: true,
    });
  } finally {
    await next.close();
  }
});
it('skips custom validators for unvalidated drafts and still runs explicit readonly draft and publish validation', async () => {
  const kit = await fixture({ validate: false }, (collection) => {
    collection.fields = collection.fields.map((field) =>
      field.name === 'title'
        ? {
            ...field,
            validate: { version: 'accepted-title', run: (value) => value === 'Accepted' },
          }
        : field,
    );
  });
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Incomplete' },
  });
  expect(draft.data['title']).toBe('Incomplete');
  const checked = await kit.content.api.validateDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: draft.revision,
    mode: 'draft',
    data: { title: 'Incomplete' },
  });
  expect(checked.valid).toBe(false);
  const missing = await kit.content.api.validateDocument(kit.owner(), {
    collection: 'articles',
    mode: 'publish',
    data: {},
  });
  expect(missing).toMatchObject({ valid: false, errors: [{ field: 'title' }] });
  await expect(
    kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      revision: draft.revision,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      revision: draft.revision,
      data: { score: 'invalid physical type' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: draft.id }))
      .revision,
  ).toBe(1);
});
it('validates the final draft with required fields and draft-mode custom context without running publication hooks', async () => {
  const seen: string[] = [];
  const kit = await fixture({ validate: true, autosave: true }, (collection) => {
    collection.hooks = {
      beforeChange: [
        {
          version: 'clear-title',
          run: ({ data }) => (data?.['score'] === 9 ? { ...data, title: '' } : data),
        },
      ],
      beforePublish: [
        {
          version: 'published',
          run: () => {
            seen.push('published');
          },
        },
      ],
    };
    collection.fields = collection.fields.map((field) =>
      field.name === 'title'
        ? {
            ...field,
            validate: {
              version: 'draft-context',
              run: (value, context) => value === 'Accepted' && context.mode === 'draft',
            },
          }
        : field,
    );
  });
  await expect(
    kit.content.api.createDocument(kit.owner(), { collection: 'articles', data: {} }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'en',
    data: { title: 'Accepted' },
  });
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      revision: first.revision,
      data: { score: 9 },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const saved = await kit.content.api.autosaveDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    data: { score: 1 },
  });
  expect(saved.revision).toBe(2);
  expect(seen).toEqual([]);
});
it('rechecks autosave configuration before replaying a previously successful request', async () => {
  const kit = await fixture({ autosave: true });
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Original' },
  });
  const ctx = kit.owner();
  const input = {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    data: { title: 'Saved' },
  };
  await kit.content.api.autosaveDocument(ctx, input);
  const next = configured(kit, { autosave: false });
  try {
    await expect(next.api.autosaveDocument(ctx, input)).rejects.toMatchObject({
      code: 'forbidden',
    });
  } finally {
    await next.close();
  }
});
it('rejects new and queued schedules after disabling scheduling while allowing cancellation and immediate publication', async () => {
  const kit = await fixture({ schedule: true });
  const docs = [];
  for (const title of ['Cancel', 'Execute'])
    docs.push(
      await kit.content.api.createDocument(kit.owner(), {
        collection: 'articles',
        data: { title },
      }),
    );
  const [cancel, execute] = docs;
  if (!cancel || !execute) throw new Error('Missing sources');
  const ctx = kit.owner();
  const input = {
    collection: 'articles',
    id: cancel.id,
    revision: cancel.revision,
    versionId: cancel.versionId,
    executeAt: new Date(Date.now() + 60000).toISOString(),
  };
  const first = await kit.content.api.schedulePublication(ctx, input);
  const second = await kit.content.api.schedulePublication(kit.owner(), {
    ...input,
    id: execute.id,
    revision: execute.revision,
    versionId: execute.versionId,
  });
  const next = configured(kit, { schedule: false });
  try {
    await expect(next.api.schedulePublication(ctx, input)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await next.api.cancelPublicationSchedule(kit.owner(), {
      collection: 'articles',
      id: cancel.id,
      scheduleId: first.jobId,
    });
    await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
      second.jobId,
    ]);
    await next.maintenance();
    expect(
      await next.api.getJob(kit.owner(), { collection: 'articles', jobId: first.jobId }),
    ).toMatchObject({ status: 'cancelled' });
    expect(
      await next.api.getJob(kit.owner(), { collection: 'articles', jobId: second.jobId }),
    ).toMatchObject({ status: 'failed', items: [{ error: { code: 'forbidden' } }] });
    const published = await next.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: execute.id,
      revision: execute.revision,
    });
    expect(published.publishedVersionId).toBe(execute.versionId);
  } finally {
    await next.close();
  }
});
