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

it('persists the timezone companion with a date through publication, copy and history and rejects unsupported zones', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    {
      id: 'event_date',
      name: 'eventDate',
      type: 'date',
      localized: true,
      timezone: {
        defaultTimezone: 'Asia/Shanghai',
        supportedTimezones: ['UTC', 'Asia/Shanghai'],
        required: true,
      },
    },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'en',
    data: { title: 'Time', eventDate: '2026-10-27T09:15:00+08:00' },
  });
  expect(first.data).toMatchObject({
    eventDate: '2026-10-27T01:15:00.000Z',
    eventDate_tz: 'Asia/Shanghai',
  });
  const publication = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
  });
  expect(publication.data['eventDate_tz']).toBe('Asia/Shanghai');
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      revision: publication.revision,
      data: { eventDate_tz: 'Invalid/Zone' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const updated = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: publication.revision,
    data: { eventDate_tz: 'UTC' },
  });
  expect(updated.data['eventDate']).toBe(first.data['eventDate']);
  const copy = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: updated.revision,
  });
  expect(copy.data['eventDate_tz']).toBe('UTC');
  const history = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: first.id,
    versionId: first.versionId,
  });
  expect(history.data['eventDate_tz']).toBe('Asia/Shanghai');
  expect(
    (
      await kit.content.api.getEditor(kit.owner(), {
        collection: 'articles',
        id: first.id,
        intent: 'update',
      })
    ).layout.find((field) => field.name === 'eventDate')?.constraints.timezone,
  ).toBe('eventDate_tz');
});
