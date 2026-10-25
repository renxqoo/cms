import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import type { Principal } from '@new-cms/cms/access';
import { createTestDatabase } from '../../../../../../../test/support/database.ts';
import { contentLimits } from '../../../../../../../test/support/content.ts';
import { createRegistry, generateArtifacts } from '../../../generate.ts';
import type {
  CollectionDefinition,
  DocumentData,
  FieldPolicyContext,
  Where,
} from '../../../definition.ts';
import { projectData, queryableFields } from '../../../fields/policies.ts';
import { validateData } from '../../../fields/validate-data.ts';
import { parseQuery } from '../../../queries/parse-query.ts';
import { createContentStore } from '../store.ts';
import type { RelationScope } from '../../../model.ts';

const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0)) await resource.close();
});
function definitions(): CollectionDefinition[] {
  const base = {
    label: 'Blocks',
    schemaVersion: 1,
    mode: 'direct' as const,
    history: false as const,
    locales: { default: 'en', supported: ['en'], fallback: {} },
  };
  return [
    {
      ...base,
      id: 'blocks_review_source',
      key: 'items',
      search: ['blocks.text'],
      fields: [
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
                { id: 'hero_text', name: 'text', type: 'text' },
                {
                  id: 'hero_related',
                  name: 'related',
                  type: 'relationship',
                  relationTo: ['targets'],
                },
              ],
            },
            {
              id: 'quote',
              key: 'quote',
              label: 'Quote',
              fields: [
                { id: 'quote_text', name: 'text', type: 'text' },
                {
                  id: 'quote_related',
                  name: 'related',
                  type: 'relationship',
                  relationTo: ['targets'],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      ...base,
      id: 'blocks_review_target',
      key: 'targets',
      fields: [{ id: 'title', name: 'title', type: 'text' }],
    },
  ];
}
function actor(id: string): Principal {
  const time = '2026-10-26T00:00:00.000Z';
  const roleId = '10000000-0000-4000-8000-000000000001';
  return {
    id,
    email: 'blocks@example.test',
    displayName: null,
    roleId,
    roleCode: 'editor',
    status: 'active',
    activation: 'activated',
    version: 1,
    createdAt: time,
    updatedAt: time,
    lastLoginAt: null,
    role: {
      id: roleId,
      code: 'editor',
      name: 'Editor',
      description: null,
      status: 'active',
      isSuper: false,
      version: 1,
      createdAt: time,
      updatedAt: time,
    },
  };
}
async function fixture(collections = definitions()) {
  const kit = await createTestDatabase();
  resources.push(kit);
  const limits = contentLimits();
  const registry = createRegistry({ collections, limits });
  const generated = generateArtifacts(registry);
  await kit.database.query(generated.sql);
  const actorId = randomUUID();
  await kit.database.query(
    "INSERT INTO admins(id,email,role_id) SELECT $1,'blocks@example.test',id FROM roles WHERE is_super",
    [actorId],
  );
  const store = createContentStore({ mapping: generated.mapping, limits });
  return { ...kit, limits, registry, store, actorId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function save(kit: Fixture, collection: string, raw: DocumentData) {
  const id = randomUUID(),
    versionId = randomUUID();
  const data = validateData({
    collection: kit.registry.get(collection),
    data: raw,
    locale: 'en',
    mode: 'draft',
    limits: kit.limits,
  });
  await kit.database.transaction(async (tx) => {
    await kit.store.insertDocument(tx, { collection, id, actorId: kit.actorId });
    await kit.store.insertRevision(tx, {
      collection,
      documentId: id,
      id: versionId,
      revision: 1,
      schemaVersion: 1,
      actorId: kit.actorId,
      kind: 'save',
      locale: 'en',
      data,
    });
    await kit.store.updateDocumentPointers(tx, {
      collection,
      id,
      revision: 1,
      expectedRevision: 0,
      currentVersionId: versionId,
      publishedVersionId: versionId,
    });
  });
  return id;
}
async function examples() {
  const kit = await fixture();
  const heroTarget = await save(kit, 'targets', { title: 'Hero target' });
  const quoteTarget = await save(kit, 'targets', { title: 'Quote target' });
  const hero = {
    id: randomUUID(),
    blockType: 'hero',
    text: 'Alpha',
    related: { collection: 'targets', id: heroTarget },
  };
  const quote = {
    id: randomUUID(),
    blockType: 'quote',
    text: 'Beta',
    related: { collection: 'targets', id: quoteTarget },
  };
  const heroId = await save(kit, 'items', { blocks: [hero] });
  const quoteId = await save(kit, 'items', { blocks: [quote] });
  const emptyId = await save(kit, 'items', { blocks: [{ id: randomUUID(), blockType: 'hero' }] });
  const bothId = await save(kit, 'items', { blocks: [hero, quote] });
  return { ...kit, heroId, quoteId, emptyId, bothId };
}
function query(
  kit: Fixture,
  input: {
    where?: Where;
    q?: string;
    queryable?: readonly string[];
    scopes?: readonly RelationScope[];
  },
) {
  return kit.database.transaction((tx) =>
    kit.store.queryDocuments(tx, {
      collection: 'items',
      limits: kit.limits,
      query: parseQuery({
        collection: kit.registry.get('items'),
        limits: kit.limits,
        input: {
          ...(input.where ? { where: input.where } : {}),
          ...(input.q ? { q: input.q } : {}),
        },
      }),
      ...(input.queryable ? { queryableFields: input.queryable } : {}),
      relationScopes: input.scopes ?? [
        {
          collection: 'targets',
          locale: 'en',
          fallback: [],
          policy: true,
          queryableFields: ['title'],
        },
      ],
    }),
  );
}
it('eq, ne and notIn search every block variant sharing the same API child path', async () => {
  const kit = await examples();
  const eq = await query(kit, { where: { field: 'blocks.text', operator: 'eq', value: 'Alpha' } });
  expect(eq.total).toBe(2);
  expect(eq.rows.map((row) => row.document.id).toSorted()).toEqual(
    [kit.heroId, kit.bothId].toSorted(),
  );
  const quote = await query(kit, {
    where: { field: 'blocks.text', operator: 'eq', value: 'Beta' },
  });
  expect(quote.total).toBe(2);
  expect(quote.rows.map((row) => row.document.id).toSorted()).toEqual(
    [kit.quoteId, kit.bothId].toSorted(),
  );
  const filters: Where[] = [
    { field: 'blocks.text', operator: 'ne', value: 'Alpha' },
    { field: 'blocks.text', operator: 'notIn', value: ['Alpha'] },
  ];
  for (const where of filters) {
    const result = await query(kit, { where });
    expect(result.total).toBe(2);
    expect(result.rows.map((row) => row.document.id).toSorted()).toEqual(
      [kit.quoteId, kit.emptyId].toSorted(),
    );
  }
});
it('exists false requires every block variant at a shared path to be missing or null', async () => {
  const kit = await examples();
  const exists = await query(kit, {
    where: { field: 'blocks.text', operator: 'exists', value: true },
  });
  expect(exists.total).toBe(3);
  expect(exists.rows.map((row) => row.document.id).toSorted()).toEqual(
    [kit.heroId, kit.quoteId, kit.bothId].toSorted(),
  );
  const missing = await query(kit, {
    where: { field: 'blocks.text', operator: 'exists', value: false },
  });
  expect(missing.total).toBe(1);
  expect(missing.rows.map((row) => row.document.id)).toEqual([kit.emptyId]);
});
it('nested relation filters traverse every same-name relation across block variants', async () => {
  const kit = await examples();
  const page = await query(kit, {
    where: { field: 'blocks.related.title', operator: 'eq', value: 'Quote target' },
  });
  expect(page.total).toBe(2);
  expect(page.rows.map((row) => row.document.id).toSorted()).toEqual(
    [kit.quoteId, kit.bothId].toSorted(),
  );
});
it('nested relation negatives require a readable complete chain and exclude matches in any block variant', async () => {
  const kit = await examples();
  const emptyTarget = await save(kit, 'targets', {});
  const missingLeaf = await save(kit, 'items', {
    blocks: [
      {
        id: randomUUID(),
        blockType: 'hero',
        related: { collection: 'targets', id: emptyTarget },
      },
    ],
  });
  for (const where of [
    { field: 'blocks.related.title', operator: 'ne', value: 'Hero target' },
    { field: 'blocks.related.title', operator: 'notIn', value: ['Hero target'] },
  ] satisfies Where[]) {
    const result = await query(kit, { where });
    expect(result.total).toBe(2);
    expect(result.rows.map((row) => row.document.id).toSorted()).toEqual(
      [kit.quoteId, missingLeaf].toSorted(),
    );
    const denied = await query(kit, {
      where,
      scopes: [
        { collection: 'targets', locale: 'en', fallback: [], policy: false, queryableFields: [] },
      ],
    });
    expect(denied.total).toBe(0);
    expect(denied.rows).toEqual([]);
  }
  const missing = await query(kit, {
    where: { field: 'blocks.related.title', operator: 'exists', value: false },
  });
  expect(missing.total).toBe(1);
  expect(missing.rows.map((row) => row.document.id)).toEqual([missingLeaf]);
});

it('a shared block path combines direct group children with relation descendants without bypassing target checks', async () => {
  const collections = definitions();
  const [source] = collections;
  if (!source) throw new Error('Missing source');
  const kit = await fixture([
    {
      ...source,
      search: [],
      fields: [
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
                { id: 'hero_link', name: 'link', type: 'relationship', relationTo: ['targets'] },
              ],
            },
            {
              id: 'quote',
              key: 'quote',
              label: 'Quote',
              fields: [
                {
                  id: 'quote_link',
                  name: 'link',
                  type: 'group',
                  fields: [{ id: 'quote_title', name: 'title', type: 'text' }],
                },
              ],
            },
          ],
        },
      ],
    },
    ...collections.slice(1),
  ]);
  const target = await save(kit, 'targets', { title: 'Wanted' });
  const hero = {
    id: randomUUID(),
    blockType: 'hero',
    link: { collection: 'targets', id: target },
  };
  const quote = { id: randomUUID(), blockType: 'quote', link: { title: 'Wanted' } };
  const heroId = await save(kit, 'items', { blocks: [hero] });
  const quoteId = await save(kit, 'items', { blocks: [quote] });
  const bothId = await save(kit, 'items', {
    blocks: [hero, { ...quote, link: { title: 'Other' } }],
  });
  const otherId = await save(kit, 'items', {
    blocks: [{ ...quote, link: { title: 'Other' } }],
  });
  const matched = await query(kit, {
    where: { field: 'blocks.link.title', operator: 'eq', value: 'Wanted' },
  });
  expect(matched.total).toBe(3);
  expect(matched.rows.map((row) => row.document.id).toSorted()).toEqual(
    [heroId, quoteId, bothId].toSorted(),
  );
  for (const where of [
    { field: 'blocks.link.title', operator: 'ne', value: 'Wanted' },
    { field: 'blocks.link.title', operator: 'notIn', value: ['Wanted'] },
  ] satisfies Where[]) {
    const result = await query(kit, { where });
    expect(result.total).toBe(1);
    expect(result.rows.map((row) => row.document.id)).toEqual([otherId]);
  }
  await expect(
    query(kit, {
      where: { field: 'blocks.link.title', operator: 'eq', value: 'Wanted' },
      scopes: [
        { collection: 'targets', locale: 'en', fallback: [], policy: true, queryableFields: [] },
      ],
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});
function denyQuoteText(source: CollectionDefinition): CollectionDefinition {
  const deny = { version: '1', run: () => false };
  return {
    ...source,
    fields: source.fields.map((field) => ({
      ...field,
      ...(field.blocks
        ? {
            blocks: field.blocks.map((block) =>
              block.key === 'quote'
                ? {
                    ...block,
                    fields: block.fields.map((child) =>
                      child.id === 'quote_text'
                        ? { ...child, access: { read: deny, query: deny } }
                        : child,
                    ),
                  }
                : block,
            ),
          }
        : {}),
    })),
  };
}
it('one denied block variant prevents its shared field path from leaking hidden values through filters or search totals', async () => {
  const kit = await examples();
  const collection = denyQuoteText(kit.registry.get('items'));
  const context: FieldPolicyContext = {
    actor: actor(kit.actorId),
    operation: 'documents.list',
    collectionKey: 'items',
    locale: 'en',
  };
  const allowed = queryableFields({ collection, context });
  const hidden = projectData({
    collection,
    context,
    data: {
      blocks: [{ id: '10000000-0000-4000-8000-000000000002', blockType: 'quote', text: 'Beta' }],
    },
  });
  expect(hidden).toEqual({
    blocks: [{ id: '10000000-0000-4000-8000-000000000002', blockType: 'quote' }],
  });
  await expect(
    query(kit, {
      where: { field: 'blocks.text', operator: 'eq', value: 'Beta' },
      queryable: allowed,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(query(kit, { q: 'Beta', queryable: allowed })).rejects.toMatchObject({
    code: 'forbidden',
  });
});
