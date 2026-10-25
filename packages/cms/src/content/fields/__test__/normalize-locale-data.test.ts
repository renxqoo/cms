import { expect, it } from 'vitest';
import { contentLimits } from '../../../../../../test/support/content.ts';
import type { CollectionDefinition, DocumentData, FieldDefinition } from '../../definition.ts';
import { normalizeLocaleData } from '../normalize-locale-data.ts';

const limits = contentLimits();
const a = '10000000-0000-4000-8000-00000000000a';
const b = '10000000-0000-4000-8000-00000000000b';
const locales = ['en', 'zh', 'fr'];
function definition(fields: readonly FieldDefinition[]): CollectionDefinition {
  return {
    id: 'locale_normalization',
    key: 'items',
    label: 'Items',
    schemaVersion: 1,
    mode: 'drafts',
    history: { maxVersions: 10, retentionMs: 0 },
    locales: { default: 'en', supported: locales, fallback: {} },
    fields,
  };
}
function currentRows(): Record<string, DocumentData> {
  return {
    en: {
      rows: [
        { id: a, code: 'A', label: 'English A' },
        { id: b, code: 'B', label: 'English B' },
      ],
    },
    zh: {
      rows: [
        { id: a, code: 'A', label: '中文甲' },
        { id: b, code: 'B', label: '中文乙' },
      ],
    },
    fr: {
      rows: [
        { id: a, code: 'A', label: 'Français A' },
        { id: b, code: 'B', label: 'Français B' },
      ],
    },
  };
}
function rowsDefinition(): CollectionDefinition {
  return definition([
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [
        { id: 'code', name: 'code', type: 'text' },
        { id: 'label', name: 'label', type: 'text', localized: true },
      ],
    },
  ]);
}

it('group patches merge recursively while hidden and omitted localized siblings remain intact', () => {
  const collection = definition([
    {
      id: 'settings',
      name: 'settings',
      type: 'group',
      fields: [
        { id: 'theme', name: 'theme', type: 'text' },
        { id: 'label', name: 'label', type: 'text', localized: true },
        {
          id: 'private',
          name: 'private',
          type: 'text',
          access: { write: { version: '1', run: () => false } },
        },
      ],
    },
  ]);
  const current = Object.fromEntries(
    locales.map((locale) => [
      locale,
      { settings: { theme: 'dark', label: locale, private: 'Hidden' } },
    ]),
  );
  const original = structuredClone(current);
  const output = normalizeLocaleData({
    collection,
    current,
    patches: { zh: { settings: { label: '新名称' } } },
    limits,
  });
  expect(output.dataByLocale).toEqual({
    en: { settings: { theme: 'dark', label: 'en', private: 'Hidden' } },
    zh: { settings: { theme: 'dark', label: '新名称', private: 'Hidden' } },
    fr: { settings: { theme: 'dark', label: 'fr', private: 'Hidden' } },
  });
  expect(output.patches).toEqual({ zh: { settings: { label: '新名称' } } });
  expect(current).toEqual(original);
});
it('explicit shared facts propagate to every locale without adding unchanged private children to effective patches', () => {
  const collection = definition([
    { id: 'slug', name: 'slug', type: 'text' },
    {
      id: 'settings',
      name: 'settings',
      type: 'group',
      fields: [
        { id: 'theme', name: 'theme', type: 'text' },
        { id: 'label', name: 'label', type: 'text', localized: true },
        { id: 'private', name: 'private', type: 'text' },
      ],
    },
  ]);
  const current = Object.fromEntries(
    locales.map((locale) => [
      locale,
      { slug: 'old', settings: { theme: 'old', label: locale, private: 'Hidden' } },
    ]),
  );
  const output = normalizeLocaleData({
    collection,
    current,
    patches: { zh: { slug: 'new', settings: { theme: 'new' } } },
    limits,
  });
  for (const locale of locales) {
    expect(output.dataByLocale[locale]).toEqual({
      slug: 'new',
      settings: { theme: 'new', label: locale, private: 'Hidden' },
    });
    expect(output.patches[locale]).toEqual({ slug: 'new', settings: { theme: 'new' } });
  }
});
it('keeps explicit same-value writes visible to authorization and retains explicitly empty locale patches', () => {
  const collection = definition([{ id: 'private', name: 'private', type: 'text' }]);
  const current = Object.fromEntries(locales.map((locale) => [locale, { private: 'Hidden' }]));
  const explicit = normalizeLocaleData({
    collection,
    current,
    patches: { zh: { private: 'Hidden' } },
    limits,
  });
  expect(explicit.patches).toEqual({
    en: { private: 'Hidden' },
    zh: { private: 'Hidden' },
    fr: { private: 'Hidden' },
  });
  expect(normalizeLocaleData({ collection, current, patches: { zh: {} }, limits }).patches).toEqual(
    { zh: {} },
  );
});
it('array reorder and deletion replace membership globally and preserve untranslated row fields by stable ID', () => {
  const collection = rowsDefinition();
  const current = currentRows();
  const reordered = normalizeLocaleData({
    collection,
    current,
    patches: { zh: { rows: [{ id: b, label: '新乙' }, { id: a }] } },
    limits,
  });
  expect(reordered.dataByLocale).toEqual({
    en: {
      rows: [
        { id: b, code: 'B', label: 'English B' },
        { id: a, code: 'A', label: 'English A' },
      ],
    },
    zh: {
      rows: [
        { id: b, code: 'B', label: '新乙' },
        { id: a, code: 'A', label: '中文甲' },
      ],
    },
    fr: {
      rows: [
        { id: b, code: 'B', label: 'Français B' },
        { id: a, code: 'A', label: 'Français A' },
      ],
    },
  });
  expect(reordered.patches).toEqual({
    en: { rows: [{ id: b }, { id: a }] },
    zh: { rows: [{ id: b, label: '新乙' }, { id: a }] },
    fr: { rows: [{ id: b }, { id: a }] },
  });
  const deleted = normalizeLocaleData({
    collection,
    current,
    patches: { zh: { rows: [{ id: a, label: '新甲' }] } },
    limits,
  });
  expect(deleted.dataByLocale['en']).toEqual({ rows: [{ id: a, code: 'A', label: 'English A' }] });
  expect(deleted.dataByLocale['zh']).toEqual({ rows: [{ id: a, code: 'A', label: '新甲' }] });
  expect(deleted.patches['fr']).toEqual({ rows: [{ id: a }] });
});
it('editing only a localized array child does not create unrelated locale write patches', () => {
  const output = normalizeLocaleData({
    collection: rowsDefinition(),
    current: currentRows(),
    patches: { zh: { rows: [{ id: a, label: '新甲' }, { id: b }] } },
    limits,
  });
  expect(output.patches).toEqual({ zh: { rows: [{ id: a, label: '新甲' }, { id: b }] } });
  expect(output.dataByLocale['en']).toEqual(currentRows()['en']);
});
it('new shared array IDs are allocated once and missing IDs adopt the one explicit identity at that position', () => {
  const collection = rowsDefinition();
  const output = normalizeLocaleData({
    collection,
    patches: {
      zh: { rows: [{ code: 'A', label: '中文' }] },
      en: { rows: [{ code: 'A', label: 'English' }] },
    },
    limits,
  });
  const en = output.dataByLocale['en']?.['rows'];
  if (!Array.isArray(en)) throw new Error('Missing normalized array');
  const [first] = en;
  if (first === null || typeof first !== 'object' || Array.isArray(first))
    throw new Error('Missing normalized row');
  const { id } = first;
  expect(id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
  expect(output.dataByLocale).toEqual({
    en: { rows: [{ id, code: 'A', label: 'English' }] },
    zh: { rows: [{ id, code: 'A', label: '中文' }] },
    fr: { rows: [{ id, code: 'A' }] },
  });
  const explicit = normalizeLocaleData({
    collection,
    patches: {
      zh: { rows: [{ code: 'A', label: '中文' }] },
      en: { rows: [{ id: a.toUpperCase(), code: 'A', label: 'English' }] },
    },
    limits,
  });
  expect(explicit.dataByLocale['zh']).toEqual({ rows: [{ id: a, code: 'A', label: '中文' }] });
});
it('shared defaults never override a value from another locale and localized defaults only apply to requested locales', () => {
  const collection = definition([
    { id: 'slug', name: 'slug', type: 'text', defaultValue: 'default-slug' },
    { id: 'title', name: 'title', type: 'text', localized: true, defaultValue: 'Untitled' },
  ]);
  for (const patches of [
    { en: {}, zh: { slug: 'provided' } },
    { zh: { slug: 'provided' }, en: {} },
  ]) {
    const output = normalizeLocaleData({ collection, patches, limits, applyDefaults: true });
    expect(output.dataByLocale).toEqual({
      en: { slug: 'provided', title: 'Untitled' },
      zh: { slug: 'provided', title: 'Untitled' },
      fr: { slug: 'provided' },
    });
    expect(output.patches).toEqual({
      en: { slug: 'provided' },
      zh: { slug: 'provided' },
      fr: { slug: 'provided' },
    });
  }
  const defaults = normalizeLocaleData({
    collection,
    patches: { en: {} },
    limits,
    applyDefaults: true,
  });
  expect(defaults.dataByLocale).toEqual({
    en: { slug: 'default-slug', title: 'Untitled' },
    zh: { slug: 'default-slug' },
    fr: { slug: 'default-slug' },
  });
  expect(defaults.patches).toEqual({ en: {} });
});
it('shared default containers keep one array identity and do not populate unrequested localized descendants', () => {
  const collection = definition([
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      defaultValue: [{ code: 'seed', label: 'Seed locale' }],
      fields: [
        { id: 'code', name: 'code', type: 'text' },
        { id: 'label', name: 'label', type: 'text', localized: true },
      ],
    },
  ]);
  const output = normalizeLocaleData({
    collection,
    patches: { en: {} },
    limits,
    applyDefaults: true,
  });
  const rows = output.dataByLocale['en']?.['rows'];
  if (!Array.isArray(rows)) throw new Error('Missing normalized default array');
  const [first] = rows;
  if (first === null || typeof first !== 'object' || Array.isArray(first))
    throw new Error('Missing normalized default row');
  const { id } = first;
  expect(output.dataByLocale).toEqual({
    en: { rows: [{ id, code: 'seed', label: 'Seed locale' }] },
    zh: { rows: [{ id, code: 'seed' }] },
    fr: { rows: [{ id, code: 'seed' }] },
  });
  expect(output.patches).toEqual({ en: {} });
});
it('localized containers permit independent descendants and preserve other languages during patches', () => {
  const collection = definition([
    {
      id: 'translated',
      name: 'translated',
      type: 'group',
      localized: true,
      fields: [{ id: 'shared_in_locale', name: 'value', type: 'text' }],
    },
  ]);
  const output = normalizeLocaleData({
    collection,
    current: { en: { translated: { value: 'English' } }, zh: { translated: { value: '中文' } } },
    patches: { en: { translated: { value: 'New English' } } },
    limits,
  });
  expect(output.dataByLocale).toEqual({
    en: { translated: { value: 'New English' } },
    zh: { translated: { value: '中文' } },
    fr: {},
  });
  expect(output.patches).toEqual({ en: { translated: { value: 'New English' } } });
});
it('null clears shared containers explicitly while empty group patches preserve existing children', () => {
  const collection = definition([
    {
      id: 'group',
      name: 'group',
      type: 'group',
      fields: [{ id: 'text', name: 'text', type: 'text', localized: true }],
    },
  ]);
  const current = Object.fromEntries(
    locales.map((locale) => [locale, { group: { text: locale } }]),
  );
  expect(
    normalizeLocaleData({ collection, current, patches: { zh: { group: {} } }, limits })
      .dataByLocale,
  ).toEqual(current);
  const cleared = normalizeLocaleData({
    collection,
    current,
    patches: { zh: { group: null } },
    limits,
  });
  expect(cleared.dataByLocale).toEqual({
    en: { group: null },
    zh: { group: null },
    fr: { group: null },
  });
  expect(cleared.patches).toEqual(cleared.dataByLocale);
});
it.each([
  { en: { rows: [{ id: a, code: 'A' }] }, zh: { rows: [{ id: a, code: 'B' }] } },
  { en: { rows: [{ id: a }] }, zh: { rows: [{ id: b }] } },
  { en: { rows: [{ id: a }, { id: b }] }, zh: { rows: [{ id: b }, { id: a }] } },
  { en: { rows: [] }, zh: { rows: [{ id: a }] } },
  { en: { rows: null }, zh: { rows: [] } },
])(
  'rejects explicit shared scalar, array identity, order or membership conflicts: %j',
  (patches) => {
    expect(() =>
      normalizeLocaleData({ collection: rowsDefinition(), patches, limits }),
    ).toThrowError('invalid input');
  },
);
it('rejects contradictory stored shared structure instead of resolving it by locale traversal order', () => {
  expect(() =>
    normalizeLocaleData({
      collection: rowsDefinition(),
      current: { en: { rows: [] }, zh: { rows: [{ id: a }] } },
      patches: {},
      limits,
    }),
  ).toThrowError('invalid input');
  const collection = definition([{ id: 'shared', name: 'shared', type: 'text' }]);
  expect(() =>
    normalizeLocaleData({
      collection,
      patches: { en: { shared: 'A' }, zh: { shared: 'B' } },
      limits,
    }),
  ).toThrowError('invalid input');
});
it('normalizes equivalent scalar encodings before checking shared conflicts', () => {
  const collection = definition([
    { id: 'ref', name: 'ref', type: 'relationship', relationTo: ['items'] },
    { id: 'date', name: 'date', type: 'date' },
    { id: 'json', name: 'json', type: 'json' },
  ]);
  const output = normalizeLocaleData({
    collection,
    patches: {
      en: {
        ref: { collection: 'items', id: a },
        date: '2026-10-26T00:00:00Z',
        json: { a: 1, b: 2 },
      },
      zh: {
        ref: { id: a.toUpperCase(), collection: 'items' },
        date: '2026-10-26T08:00:00+08:00',
        json: { b: 2, a: 1 },
      },
    },
    limits,
  });
  for (const locale of locales)
    expect(output.dataByLocale[locale]).toEqual({
      ref: { collection: 'items', id: a },
      date: '2026-10-26T00:00:00.000Z',
      json: { a: 1, b: 2 },
    });
});
it('validates field rules against full normalized data rather than partial scalar comparison objects', () => {
  const collection = definition([
    { id: 'slug', name: 'slug', type: 'text' },
    {
      id: 'confirm',
      name: 'confirm',
      type: 'text',
      validate: { version: '1', run: (value, context) => value === context.data['slug'] },
    },
  ]);
  const output = normalizeLocaleData({
    collection,
    patches: { en: { slug: 'same', confirm: 'same' } },
    limits,
  });
  expect(output.dataByLocale['zh']).toEqual({ slug: 'same', confirm: 'same' });
  expect(() =>
    normalizeLocaleData({ collection, patches: { en: { slug: 'one', confirm: 'two' } }, limits }),
  ).toThrowError('invalid input');
});
it('rejects unknown locales, malformed values, duplicate row identities and garbage without mutating inputs', () => {
  const collection = rowsDefinition();
  for (const patches of [
    {},
    { de: {} },
    { en: { unknown: 'field' } },
    { en: { rows: [{ id: 'invalid' }] } },
    { en: { rows: [{ id: a }, { id: a }] } },
    { en: { rows: [{ id: a, unknown: 'field' }] } },
    { en: { rows: [{ id: a, label: 12 }] } },
  ])
    expect(() => normalizeLocaleData({ collection, patches, limits })).toThrowError(
      'invalid input',
    );
  expect(() =>
    normalizeLocaleData({ collection, current: { de: {} }, patches: { en: {} }, limits }),
  ).toThrowError('invalid input');
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  const patches: Record<string, DocumentData> = { en: {} };
  Reflect.set(patches['en'] ?? {}, 'rows', cyclic);
  expect(() => normalizeLocaleData({ collection, patches, limits })).toThrowError('invalid input');
  const current = currentRows();
  const original = structuredClone(current);
  expect(normalizeLocaleData({ collection, current, patches: {}, limits }).dataByLocale).toEqual(
    current,
  );
  expect(current).toEqual(original);
});

function blocksDefinition(): CollectionDefinition {
  return definition([
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
            { id: 'hero_code', name: 'code', type: 'text' },
            { id: 'heading', name: 'heading', type: 'text', localized: true },
          ],
        },
        {
          id: 'quote',
          key: 'quote',
          label: 'Quote',
          fields: [{ id: 'quotation', name: 'quotation', type: 'text', localized: true }],
        },
      ],
    },
  ]);
}
it('blocks preserve per-language fields, infer existing block type by identity and reject explicit type conflicts', () => {
  const collection = blocksDefinition();
  const current = Object.fromEntries(
    locales.map((locale) => [
      locale,
      { blocks: [{ id: a, blockType: 'hero', code: 'H', heading: locale }] },
    ]),
  );
  const output = normalizeLocaleData({
    collection,
    current,
    patches: { zh: { blocks: [{ id: a, heading: '新标题' }] } },
    limits,
  });
  expect(output.dataByLocale).toEqual({
    en: { blocks: [{ id: a, blockType: 'hero', code: 'H', heading: 'en' }] },
    zh: { blocks: [{ id: a, blockType: 'hero', code: 'H', heading: '新标题' }] },
    fr: { blocks: [{ id: a, blockType: 'hero', code: 'H', heading: 'fr' }] },
  });
  expect(output.patches).toEqual({
    zh: { blocks: [{ id: a, blockType: 'hero', heading: '新标题' }] },
  });
  expect(() =>
    normalizeLocaleData({
      collection,
      patches: {
        en: { blocks: [{ id: a, blockType: 'hero' }] },
        zh: { blocks: [{ id: a, blockType: 'quote' }] },
      },
      limits,
    }),
  ).toThrowError('invalid input');
  const changed = normalizeLocaleData({
    collection,
    current,
    patches: { zh: { blocks: [{ id: a, blockType: 'quote', quotation: '新引用' }] } },
    limits,
  });
  expect(changed.dataByLocale).toEqual({
    en: { blocks: [{ id: a, blockType: 'quote' }] },
    zh: { blocks: [{ id: a, blockType: 'quote', quotation: '新引用' }] },
    fr: { blocks: [{ id: a, blockType: 'quote' }] },
  });
});
it('nested groups within shared rows retain localized siblings while propagating shared child facts', () => {
  const collection = definition([
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [
        {
          id: 'details',
          name: 'details',
          type: 'group',
          fields: [
            { id: 'enabled', name: 'enabled', type: 'boolean' },
            { id: 'text', name: 'text', type: 'text', localized: true },
          ],
        },
      ],
    },
  ]);
  const current = Object.fromEntries(
    locales.map((locale) => [
      locale,
      { rows: [{ id: a, details: { enabled: false, text: locale } }] },
    ]),
  );
  const output = normalizeLocaleData({
    collection,
    current,
    patches: { zh: { rows: [{ id: a, details: { enabled: true } }] } },
    limits,
  });
  for (const locale of locales) {
    expect(output.dataByLocale[locale]).toEqual({
      rows: [{ id: a, details: { enabled: true, text: locale } }],
    });
    expect(output.patches[locale]).toEqual({ rows: [{ id: a, details: { enabled: true } }] });
  }
});
it('applying defaults without requested locale writes only shared values and preserves the explicit boundary', () => {
  const collection = definition([
    {
      id: 'title',
      name: 'title',
      type: 'text',
      localized: true,
      defaultValue: 'Localized default',
    },
    {
      id: 'settings',
      name: 'settings',
      type: 'group',
      defaultValue: { code: 'seed', label: 'Seed local' },
      fields: [
        { id: 'code', name: 'code', type: 'text' },
        { id: 'label', name: 'label', type: 'text', localized: true },
      ],
    },
  ]);
  const output = normalizeLocaleData({
    collection,
    current: { en: {} },
    patches: {},
    limits,
    applyDefaults: true,
  });
  expect(output.dataByLocale).toEqual({
    en: { settings: { code: 'seed' } },
    zh: { settings: { code: 'seed' } },
    fr: { settings: { code: 'seed' } },
  });
  expect(output.patches).toEqual({});
});
it('rejects oversized and deeply nested input before generating rows or recursing through field structure', () => {
  expect(() =>
    normalizeLocaleData({
      collection: rowsDefinition(),
      patches: { en: { rows: [{}, {}, {}] } },
      limits: { ...limits, maxArrayItems: 2 },
    }),
  ).toThrowError('invalid input');
  let deep: unknown = 'value';
  for (let index = 0; index < 50000; index += 1) deep = { nested: deep };
  const patches: Record<string, DocumentData> = { en: {} };
  Reflect.set(patches['en'] ?? {}, 'rows', deep);
  expect(() => normalizeLocaleData({ collection: rowsDefinition(), patches, limits })).toThrowError(
    'payload too large',
  );
});
it('does not treat inherited object members as an unprovided locale patch', () => {
  const collection = {
    ...definition([{ id: 'name', name: 'name', type: 'text', localized: true }]),
    locales: { default: 'en', supported: ['en', 'constructor'], fallback: {} },
  };
  const output = normalizeLocaleData({ collection, patches: { en: { name: 'English' } }, limits });
  expect(output.dataByLocale).toEqual({ en: { name: 'English' }, constructor: {} });
  expect(output.patches).toEqual({ en: { name: 'English' } });
});
