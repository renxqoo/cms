import type {
  CollectionDefinition,
  ContentLimits,
  DocumentData,
} from '@new-cms/cms/content/generate';

export function contentLimits(overrides: Partial<ContentLimits> = {}): ContentLimits {
  return {
    maxStorageBytes: 16_777_216,
    maxLocales: 20,
    maxFields: 100,
    maxFieldDepth: 8,
    maxArrayItems: 1000,
    maxDataBytes: 1_048_576,
    maxRichTextNodes: 1000,
    maxRichTextDepth: 8,
    maxQueryNodes: 100,
    maxQueryDepth: 8,
    maxPageSize: 100,
    defaultPageSize: 20,
    maxExpandDepth: 3,
    maxExpandNodes: 500,
    maxResponseBytes: 2_097_152,
    maxSqlQueries: 200,
    ...overrides,
  };
}
const locales = { default: 'en', supported: ['en', 'zh-CN'], fallback: { 'zh-CN': ['en'] } };
const definitions: CollectionDefinition[] = [
  {
    id: 'test_articles',
    key: 'articles',
    label: 'Articles',
    schemaVersion: 1,
    mode: 'drafts',
    history: { maxVersions: 10, retentionMs: 0 },
    locales,
    search: ['title', 'sections.heading'],
    defaultSort: [{ field: 'title', order: 'asc' }],
    fields: [
      {
        id: 'title',
        name: 'title',
        label: 'Title',
        type: 'text',
        required: true,
        localized: true,
        maxLength: 200,
        index: true,
      },
      { id: 'slug', name: 'slug', type: 'text', unique: true },
      { id: 'score', name: 'score', type: 'number', min: 0, max: 100, precision: 2 },
      { id: 'enabled', name: 'enabled', type: 'boolean', defaultValue: false },
      { id: 'published_date', name: 'date', type: 'date' },
      { id: 'contact', name: 'contact', type: 'email' },
      {
        id: 'categories',
        name: 'categories',
        type: 'select',
        options: ['news', 'guide'],
        hasMany: true,
      },
      { id: 'body_code', name: 'code', type: 'code' },
      { id: 'extra', name: 'extra', type: 'json' },
      { id: 'location', name: 'location', type: 'point' },
      {
        id: 'seo',
        name: 'seo',
        type: 'group',
        fields: [{ id: 'seo_description', name: 'description', type: 'textarea', localized: true }],
      },
      {
        id: 'sections',
        name: 'sections',
        type: 'array',
        fields: [
          { id: 'section_heading', name: 'heading', type: 'text' },
          {
            id: 'section_items',
            name: 'items',
            type: 'array',
            fields: [{ id: 'item_label', name: 'label', type: 'text' }],
          },
        ],
      },
      {
        id: 'layout',
        name: 'layout',
        type: 'blocks',
        blocks: [
          {
            id: 'hero_block',
            key: 'hero',
            label: 'Hero',
            fields: [{ id: 'hero_text', name: 'text', type: 'text' }],
          },
          {
            id: 'quote_block',
            key: 'quote',
            label: 'Quote',
            fields: [{ id: 'quote_text', name: 'quotation', type: 'text' }],
          },
        ],
      },
      { id: 'author', name: 'author', type: 'relationship', relationTo: ['pages'] },
      {
        id: 'related',
        name: 'related',
        type: 'relationship',
        relationTo: ['articles', 'pages'],
        hasMany: true,
      },
      { id: 'body', name: 'body', type: 'richText' },
      {
        id: 'view_row',
        type: 'row',
        fields: [{ id: 'subtitle', name: 'subtitle', type: 'text' }],
      },
      {
        id: 'view_tabs',
        type: 'tabs',
        tabs: [
          {
            id: 'details_tab',
            name: 'details',
            label: 'Details',
            fields: [{ id: 'details_note', name: 'note', type: 'text' }],
          },
          {
            id: 'other_tab',
            label: 'Other',
            fields: [{ id: 'other', name: 'other', type: 'text' }],
          },
        ],
      },
    ],
  },
  {
    id: 'test_pages',
    key: 'pages',
    label: 'Pages',
    schemaVersion: 1,
    mode: 'direct',
    history: false,
    locales,
    fields: [
      { id: 'page_title', name: 'title', type: 'text', required: true },
      { id: 'page_status', name: 'status', type: 'select', options: ['public', 'private'] },
      {
        id: 'inverse',
        name: 'articles',
        type: 'join',
        join: { collection: 'articles', field: 'author' },
      },
    ],
  },
];
export function contentDefinitions(): CollectionDefinition[] {
  return structuredClone(definitions);
}
export function articleData(overrides: DocumentData = {}): DocumentData {
  return {
    title: 'Alpha',
    slug: 'alpha',
    score: 0,
    enabled: false,
    date: '2026-10-26T01:02:03.123Z',
    contact: 'editor@example.test',
    categories: ['news', 'guide'],
    code: 'const x = 1',
    extra: { nested: ['value', null, false, 0] },
    location: [103.85, 1.29],
    seo: { description: 'Search description' },
    sections: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        heading: 'Section',
        items: [{ id: '10000000-0000-4000-8000-000000000002', label: 'Nested' }],
      },
    ],
    layout: [
      { id: '10000000-0000-4000-8000-000000000003', blockType: 'hero', text: 'Welcome' },
      { id: '10000000-0000-4000-8000-000000000004', blockType: 'quote', quotation: 'Clear words' },
    ],
    body: {
      version: 1,
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Safe text' },
            {
              type: 'link',
              url: 'https://example.test',
              children: [{ type: 'text', text: 'Link' }],
            },
          ],
        },
      ],
    },
    subtitle: 'Subtitle',
    details: { note: 'Note' },
    other: 'Other',
    ...overrides,
  };
}
