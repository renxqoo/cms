import { expect, it } from 'vitest';
import { contentDefinitions, contentLimits } from '../../../../../../test/support/content.ts';
import {
  createRegistry,
  compileContent,
  generateArtifacts,
  generateTypes,
  generateDataSchemas,
} from '../../generate.ts';
import type { CollectionDefinition, FieldDefinition } from '../../definition.ts';
import { comparePlans } from '@new-cms/database/codegen';

function altered(change: (collection: CollectionDefinition) => CollectionDefinition) {
  const definitions = contentDefinitions();
  const [article] = definitions;
  if (!article) throw new Error('Missing article');
  return [
    change(article),
    ...definitions.slice(1).map((definition) => ({
      ...definition,
      fields: definition.fields.filter((field) => field.type !== 'join'),
    })),
  ];
}
function registry(definitions = contentDefinitions()) {
  return createRegistry({
    collections: definitions,
    limits: contentLimits(),
    operations: [{ id: 'documents.get', scopeKind: 'collection' }],
  });
}
it('normalizes without mutating caller configuration and produces stable offline artifacts', () => {
  const definitions = contentDefinitions();
  const registered = registry(definitions);
  const first = generateArtifacts(registered);
  const second = generateArtifacts(registry(definitions.toReversed()));
  expect(first.sql).toBe(second.sql);
  expect(first.drizzle).toBe(second.drizzle);
  expect(first.types).toBe(second.types);
  expect(Object.isFrozen(registered)).toBe(true);
  expect(Object.isFrozen(registered.get('articles').fields)).toBe(true);
  expect(Object.isFrozen(definitions)).toBe(false);
  expect(() => registered.get('missing')).toThrowError('not found');
});
it.each<Partial<CollectionDefinition>>([
  { id: 'Invalid ID' },
  { key: 'Invalid Key' },
  { schemaVersion: 0 },
  { label: '' },
  { mode: 'drafts', history: false },
  { locales: { default: 'fr', supported: ['en'], fallback: {} } },
  { locales: { default: 'en', supported: ['en', 'en'], fallback: {} } },
  { locales: { default: 'en', supported: ['en'], fallback: { en: ['en'] } } },
  { locales: { default: 'en', supported: ['en'], fallback: { fr: ['en'] } } },
  { locales: { default: 'en', supported: ['en'], fallback: { en: ['fr'] } } },
  { indexes: [{ id: 'bad', fields: ['missing'] }] },
  { indexes: [{ id: 'bad', fields: ['sections.heading'] }] },
  { indexes: [{ id: 'bad', fields: ['title', 'title'] }] },
  { search: ['score'] },
  { defaultSort: [{ field: 'missing', order: 'asc' }] },
])('rejects invalid collection contract %j', (patch) => {
  expect(() => registry(altered((collection) => ({ ...collection, ...patch })))).toThrowError(
    'invalid input',
  );
});
it.each<Partial<FieldDefinition>>([
  { id: 'invalid-id' },
  { name: 'id' },
  { name: 'constructor' },
  { type: 'number', fields: [] },
  { type: 'text', blocks: [] },
  { type: 'text', tabs: [] },
  { type: 'number', options: ['one'] },
  { type: 'select', options: ['one', 'one'] },
  { type: 'number', relationTo: ['pages'] },
  { type: 'relationship', relationTo: ['pages', 'pages'] },
  { type: 'text', join: { collection: 'pages', field: 'title' } },
  { type: 'text', onDelete: 'cascade' },
  { type: 'number', hasMany: true },
  { type: 'text', precision: 2 },
  { type: 'text', min: 0 },
  { type: 'number', maxLength: 10 },
  { type: 'number', min: 10, max: 0 },
  { type: 'text', minLength: 10, maxLength: 1 },
  { type: 'array', fields: [], unique: true },
  { type: 'row', fields: [], name: 'named' },
  { type: 'tabs', tabs: [{ id: 'tab', name: 'id', label: 'Tab', fields: [] }] },
  { type: 'join', join: { collection: 'pages', field: 'title' }, required: true },
  { type: 'group' },
  { type: 'array' },
  { type: 'blocks' },
  { type: 'tabs' },
  { type: 'select' },
  { type: 'relationship' },
  { type: 'upload' },
  { type: 'join' },
])('rejects unsupported or inconsistent field options %j', (patch) => {
  expect(() =>
    registry(
      altered((collection) => ({
        ...collection,
        fields: [{ id: 'sample', name: 'sample', type: 'text', ...patch }],
      })),
    ),
  ).toThrowError('invalid input');
});
it('rejects duplicate identities, unknown configuration, invalid target and invalid inverse join', () => {
  const definitions = contentDefinitions();
  const [first] = definitions;
  if (!first) throw new Error('Missing definition');
  expect(() => registry([...definitions, first])).toThrowError('invalid input');
  expect(() =>
    registry(
      altered((collection) => ({
        ...collection,
        fields: [
          { id: 'a', name: 'same', type: 'text' },
          { id: 'b', name: 'same', type: 'text' },
        ],
      })),
    ),
  ).toThrowError('invalid input');
  expect(() =>
    registry(
      altered((collection) => ({
        ...collection,
        fields: [
          { id: 'a', name: 'one', type: 'text' },
          { id: 'a', name: 'two', type: 'text' },
        ],
      })),
    ),
  ).toThrowError('invalid input');
  expect(() =>
    registry(
      altered((collection) => ({
        ...collection,
        fields: [{ id: 'a', name: 'ref', type: 'relationship', relationTo: ['missing'] }],
      })),
    ),
  ).toThrowError('invalid input');
  expect(() =>
    registry(
      altered((collection) => ({
        ...collection,
        fields: [{ id: 'a', name: 'file', type: 'upload', relationTo: ['pages'] }],
      })),
    ),
  ).toThrowError('invalid input');
  expect(() =>
    registry(
      altered((collection) => ({
        ...collection,
        fields: [
          { id: 'a', name: 'inverse', type: 'join', join: { collection: 'pages', field: 'title' } },
        ],
      })),
    ),
  ).toThrowError('invalid input');
  const unknown = { ...first, unknownOption: true };
  expect(() => registry([unknown])).toThrowError('invalid input');
});
it('enforces field-count/depth budgets before runtime and freezes nested default data', () => {
  expect(() =>
    createRegistry({ collections: contentDefinitions(), limits: contentLimits({ maxFields: 1 }) }),
  ).toThrowError('invalid input');
  expect(() =>
    createRegistry({
      collections: contentDefinitions(),
      limits: contentLimits({ maxFieldDepth: 1 }),
    }),
  ).toThrowError('invalid input');
  const definitions = altered((collection) => ({
    ...collection,
    fields: [
      ...collection.fields,
      {
        id: 'default_extra',
        name: 'defaultExtra',
        type: 'json',
        defaultValue: { nested: [false, 0] },
      },
    ],
  }));
  expect(Object.isFrozen(registry(definitions).get('articles').fields.at(-1)?.defaultValue)).toBe(
    true,
  );
});
it('behavior function version changes behavior digest without changing SQL shape', () => {
  const first = build('1');
  const second = build('2');
  expect(first.behaviorHash).not.toBe(second.behaviorHash);
  expect(compileContent(first).fingerprint).toBe(compileContent(second).fingerprint);
});
it('API rename retains immutable old physical mapping and generated contracts distinguish draft, publication and projected reads', () => {
  const initial = registry();
  const [definition] = contentDefinitions();
  if (!definition) throw new Error('Missing collection');
  const renamed = {
    ...definition,
    schemaVersion: 2,
    fields: definition.fields.map((field) =>
      field.id === 'title' ? { ...field, name: 'headline' } : field,
    ),
    search: ['headline', 'sections.heading'],
    defaultSort: [{ field: 'headline', order: 'asc' as const }],
    previousSchemas: [definition],
  };
  const changed = registry([renamed, ...contentDefinitions().slice(1)]);
  const before = compileContent(initial);
  const after = compileContent(changed);
  const changes = comparePlans(before.plan, after.plan);
  expect(changes.length).toBeGreaterThan(0);
  expect(changes.every((change) => change.kind === 'addTable' && !change.destructive)).toBe(true);
  for (const table of before.plan.tables)
    expect(after.plan.tables.find((item) => item.name === table.name)).toEqual(table);
  expect(after.get('articles', 1).flat.map((field) => field.identityPath)).toEqual(
    after.get('articles', 2).flat.map((field) => field.identityPath),
  );
  const types = generateTypes(initial);
  expect(types).toContain('export interface DraftData');
  expect(types).toContain('export interface PublishedData');
  expect(types).toContain('export interface ReadData');
  expect(types).toContain('ExpandedDocument<"pages">');
  expect(generateDataSchemas(initial, 'read')['articles']).toMatchObject({ required: [] });
  expect(generateDataSchemas(initial, 'published')['articles']).toMatchObject({
    required: ['title'],
  });
});
it('rejects history schema collisions and missing history mapping explicitly', () => {
  const [definition] = contentDefinitions();
  if (!definition) throw new Error('Missing collection');
  expect(() =>
    registry(altered((collection) => ({ ...collection, previousSchemas: [definition] }))),
  ).toThrowError('invalid input');
  expect(() => compileContent(registry()).get('articles', 99)).toThrowError('invalid input');
});

function build(version: string) {
  return registry(
    altered((collection) => ({
      ...collection,
      access: { 'documents.get': { version, run: () => true } },
    })),
  );
}
it('rejects invalid defaults and locale counts above the configured budget before serving requests', () => {
  expect(() =>
    createRegistry({ collections: contentDefinitions(), limits: contentLimits({ maxLocales: 1 }) }),
  ).toThrowError('invalid input');
  expect(() =>
    registry(
      altered((definition) => ({
        ...definition,
        fields: [
          { id: 'bad_default', name: 'badDefault', type: 'number', min: 0, defaultValue: -1 },
        ],
      })),
    ),
  ).toThrowError('invalid input');
});
it('rejects default sorting on structural and virtual values before building the server', () => {
  expect(() =>
    registry(
      altered((definition) => ({ ...definition, defaultSort: [{ field: 'seo', order: 'asc' }] })),
    ),
  ).toThrowError('invalid input');
  const definitions = contentDefinitions();
  const pages = definitions.find((definition) => definition.key === 'pages');
  if (!pages) throw new Error('Missing pages');
  expect(() =>
    registry(
      definitions.map((definition) =>
        definition.key === 'pages'
          ? { ...definition, defaultSort: [{ field: 'articles', order: 'asc' }] }
          : definition,
      ),
    ),
  ).toThrowError('invalid input');
});
it('collection access policies require the exact injected operation vocabulary', () => {
  const definitions = altered((definition) => ({
    ...definition,
    access: { 'documents.typo': { version: '1', run: () => false } },
  }));
  expect(() => registry(definitions)).toThrowError('invalid input');
  const known = altered((definition) => ({
    ...definition,
    access: { 'documents.get': { version: '1', run: () => false } },
  }));
  expect(() => createRegistry({ collections: known, limits: contentLimits() })).toThrowError(
    'invalid input',
  );
  expect(() =>
    createRegistry({
      collections: known,
      limits: contentLimits(),
      operations: [{ id: 'documents.get', scopeKind: 'global' }],
    }),
  ).toThrowError('invalid input');
  expect(() => registry(known)).not.toThrow();
});
