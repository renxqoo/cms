import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../../../../../../../test/support/database.ts';
import { contentLimits } from '../../../../../../../test/support/content.ts';
import { createRegistry, generateArtifacts } from '../../../generate.ts';
import type { CollectionDefinition, DocumentData, ContentLimits } from '../../../definition.ts';
import type { QueryInput } from '../../../model.ts';
import type { SqlExecutor } from '@new-cms/database/client';
import { createContentStore } from '../store.ts';
import { parseQuery } from '../../../queries/parse-query.ts';
export function projectionDefinition(): CollectionDefinition {
  return {
    id: 'projection_articles',
    key: 'articles',
    label: 'Articles',
    schemaVersion: 1,
    mode: 'drafts',
    history: { maxVersions: 100, retentionMs: 0 },
    locales: { default: 'en', supported: ['en', 'zh'], fallback: { zh: ['en'] } },
    fields: [
      { id: 'title', name: 'title', type: 'text', localized: true },
      { id: 'body', name: 'body', type: 'json' },
      {
        id: 'secret',
        name: 'secret',
        type: 'text',
        access: { read: { version: 'hidden', run: () => false } },
      },
      {
        id: 'meta',
        name: 'meta',
        type: 'group',
        fields: [
          { id: 'headline', name: 'headline', type: 'text' },
          { id: 'description', name: 'description', type: 'json' },
        ],
      },
      {
        id: 'bindings',
        name: 'apiBindings',
        type: 'array',
        fields: [
          { id: 'key', name: 'key', type: 'text' },
          { id: 'request', name: 'requestValues', type: 'json' },
          {
            id: 'scenarios',
            name: 'scenarios',
            type: 'array',
            fields: [
              { id: 'scenario_key', name: 'key', type: 'text' },
              { id: 'scenario_body', name: 'body', type: 'json' },
            ],
          },
        ],
      },
      {
        id: 'blocks',
        name: 'blocks',
        type: 'blocks',
        blocks: [
          {
            id: 'hero',
            key: 'hero',
            label: 'Hero',
            fields: [
              { id: 'hero_label', name: 'label', type: 'text' },
              { id: 'hero_body', name: 'body', type: 'json' },
            ],
          },
          {
            id: 'quote',
            key: 'quote',
            label: 'Quote',
            fields: [
              { id: 'quote_label', name: 'label', type: 'text' },
              { id: 'quote_body', name: 'body', type: 'json' },
            ],
          },
        ],
      },
    ],
  };
}
export async function projectionFixture(definition = projectionDefinition()) {
  const kit = await createTestDatabase({ migrationScope: 'library' });
  try {
    const limits = contentLimits(),
      registry = createRegistry({ collections: [definition], limits }),
      artifacts = generateArtifacts(registry);
    await kit.database.query(artifacts.sql);
    const actorId = randomUUID();
    await kit.database.query(
      "INSERT INTO admins(id,email,role_id) SELECT $1,'projection@example.test',id FROM roles WHERE is_super",
      [actorId],
    );
    return {
      ...kit,
      limits,
      registry,
      artifacts,
      actorId,
      store: createContentStore({ mapping: artifacts.mapping, limits }),
    };
  } catch (error) {
    await kit.close();
    throw error;
  }
}
export type ProjectionFixture = Awaited<ReturnType<typeof projectionFixture>>;
export function saveProjection(kit: ProjectionFixture, data: DocumentData) {
  return kit.database.transaction(async (tx) => {
    const id = randomUUID(),
      versionId = randomUUID();
    await kit.store.insertDocument(tx, { collection: 'articles', id, actorId: kit.actorId });
    await kit.store.insertRevision(tx, {
      collection: 'articles',
      documentId: id,
      id: versionId,
      revision: 1,
      actorId: kit.actorId,
      data,
      locale: 'en',
      schemaVersion: kit.registry.get('articles').schemaVersion,
      kind: 'save',
    });
    await kit.store.updateDocumentPointers(tx, {
      actorId: kit.actorId,
      collection: 'articles',
      id,
      expectedRevision: 0,
      revision: 1,
      currentVersionId: versionId,
      publishedVersionId: versionId,
    });
    return { id, versionId };
  });
}
export function readProjection(
  kit: ProjectionFixture,
  input: {
    projection?: readonly string[];
    limits?: ContentLimits;
    query?: Partial<QueryInput>;
    statements?: string[];
    queryableFields?: readonly string[];
  } = {},
) {
  return kit.database.transaction((tx) => {
    const observer: SqlExecutor = {
      query(text, values) {
        input.statements?.push(text);
        return tx.query(text, values);
      },
    };
    return kit.store.queryDocuments(observer, {
      collection: 'articles',
      query: parseQuery({
        collection: kit.store.definition('articles'),
        limits: kit.limits,
        input: { mode: 'published', ...input.query },
      }),
      limits: input.limits ?? kit.limits,
      ...(input.projection === undefined ? {} : { projection: input.projection }),
      ...(input.queryableFields ? { queryableFields: input.queryableFields } : {}),
    });
  });
}
