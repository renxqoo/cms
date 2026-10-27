import { afterEach, expect, it } from 'vitest';
import { createRegistry, generateEvolution } from '@new-cms/cms/content/generate';
import { createContent } from '@new-cms/cms/content/composition';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import { migrateSchemaState } from '../migrate-schema-state.ts';

const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0).toReversed()) await resource.close();
});

async function fixture() {
  const kit: ContentFixture = await createContentFixture();
  resources.push(kit);
  const documents = [];
  for (const title of ['First', 'Second'])
    documents.push(
      await kit.content.api.createDocument(kit.owner(), {
        collection: 'articles',
        data: { title },
      }),
    );
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.previousSchemas = [structuredClone(articles)];
  articles.schemaVersion = 2;
  articles.fields = [
    ...articles.fields,
    { id: 'migrated', name: 'migrated', type: 'boolean', defaultValue: true },
  ];
  articles.migrations = [{ from: 1, version: 'add-migrated', transform: (data) => data }];
  const registry = createRegistry({ collections, limits: kit.limits });
  const evolution = generateEvolution({ previous: kit.artifacts.snapshot, registry });
  await kit.database.query(evolution.sql);
  const options = {
    ...kit.contentOptions,
    registry,
    mapping: evolution.mapping,
    resourceLockKey: kit.contentOptions.workPolicy.resourceLockKey,
  };
  return { kit, options, documents };
}

it('stops at its page budget without activating, resumes persisted backfills and permits current-schema reads', async () => {
  const { kit, options, documents } = await fixture();
  const reports: unknown[] = [];
  const control = {
    pageSize: 1,
    maxPages: 1,
    signal: new AbortController().signal,
    report: (value: unknown) => reports.push(value),
  };
  await expect(migrateSchemaState(options, control)).rejects.toThrow('page budget exhausted');
  expect(
    (
      await kit.database.query(
        'SELECT schema_version FROM content_schema_control WHERE collection_id=$1',
        ['workflow_articles'],
      )
    ).rows,
  ).toEqual([{ schema_version: 1 }]);
  expect(reports).toHaveLength(1);
  await migrateSchemaState(options, { ...control, maxPages: 10 });
  expect(reports.at(-1)).toMatchObject({
    type: 'activated',
    collections: ['articles', 'pages', 'settings'],
  });
  const current = createContent(options);
  resources.push(current);
  for (const document of documents)
    expect(
      await current.api.getDocument(kit.owner(), { collection: 'articles', id: document.id }),
    ).toMatchObject({ revision: document.revision, data: { migrated: true } });
  await migrateSchemaState(options, { ...control, maxPages: 10 });
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    migrateSchemaState(options, { ...control, signal: aborted.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
