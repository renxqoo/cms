import type { CollectionDefinition, FieldDefinition } from '@new-cms/cms/content/generate';
import { oneasterCollections } from './oneaster.ts';

const locales = {
  default: 'en',
  supported: ['en', 'zh-CN'],
  fallback: { en: [], 'zh-CN': ['en'] },
} as const;
const history = { maxVersions: 100, retentionMs: 604_800_000 };
const editorCollaboration = { durationMs: 300000, heartbeatMs: 30000 };

const articleV1: CollectionDefinition = {
  id: 'articles',
  key: 'articles',
  schemaVersion: 1,
  label: 'Articles',
  mode: 'drafts',
  drafts: { validate: false, autosave: { intervalMs: 10000 }, schedule: true },
  history,
  locales,
  fields: [
    {
      id: 'title',
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      maxLength: 256,
      index: true,
    },
    {
      id: 'slug',
      name: 'slug',
      type: 'text',
      required: true,
      localized: true,
      maxLength: 128,
      unique: true,
    },
    { id: 'summary', name: 'summary', type: 'textarea', localized: true, maxLength: 2000 },
    { id: 'body', name: 'body', type: 'richText', localized: true },
    { id: 'cover', name: 'cover', type: 'upload', relationTo: ['media'] },
    {
      id: 'related',
      name: 'related',
      type: 'relationship',
      relationTo: ['articles', 'pages'],
      hasMany: true,
    },
  ],
  search: ['title', 'summary'],
  defaultSort: [{ field: 'title', order: 'asc' }],
};

function presentedArticleField(field: FieldDefinition): FieldDefinition {
  if (field.name === 'title')
    return { ...field, admin: { components: { afterInput: ['cms/character-count'] } } };
  if (field.name === 'slug') return { ...field, admin: { components: { Cell: 'cms/monospace' } } };
  if (field.name === 'summary')
    return {
      ...field,
      admin: {
        condition: {
          version: 'title-present-1',
          run: ({ data }) => typeof data['title'] === 'string' && data['title'].trim().length > 0,
        },
      },
    };
  return field;
}

const pageV1: CollectionDefinition = {
  id: 'pages',
  key: 'pages',
  schemaVersion: 1,
  label: 'Pages',
  mode: 'drafts',
  drafts: { validate: false, autosave: { intervalMs: 10000 }, schedule: true },
  history,
  lockDocuments: editorCollaboration,
  locales,
  hierarchy: { slugField: 'slug' },
  admin: { useAsTitle: 'title' },
  fields: [
    {
      id: 'title',
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      maxLength: 256,
      index: true,
    },
    {
      id: 'slug',
      name: 'slug',
      type: 'text',
      required: true,
      localized: true,
      maxLength: 128,
      unique: true,
    },
    { id: 'body', name: 'body', type: 'richText', localized: true },
    { id: 'parent', name: 'parent', type: 'relationship', relationTo: ['pages'] },
  ],
  search: ['title'],
  defaultSort: [{ field: 'title', order: 'asc' }],
};

const originalCollections: readonly CollectionDefinition[] = [
  {
    ...articleV1,
    schemaVersion: 2,
    orderable: true,
    localizeStatus: true,
    lockDocuments: editorCollaboration,
    admin: { components: { Header: 'cms/section' } },
    previousSchemas: [articleV1],
    migrations: [{ from: 1, version: 'article-tags-v1', transform: (data) => data }],
    fields: [
      ...articleV1.fields.map(presentedArticleField),
      {
        id: 'tags',
        name: 'tags',
        label: 'Tags',
        type: 'relationship',
        relationTo: ['tags'],
        hasMany: true,
      },
    ],
  },
  {
    ...pageV1,
    schemaVersion: 2,
    previousSchemas: [pageV1],
    migrations: [{ from: 1, version: 'page-articles-join-v1', transform: (data) => data }],
    fields: [
      ...pageV1.fields,
      {
        id: 'articles_join',
        name: 'articles',
        label: 'Related articles',
        type: 'join',
        join: { collection: 'articles', field: 'related', defaultPageSize: 2, orderable: true },
      },
    ],
  },
  {
    id: 'media',
    key: 'media',
    schemaVersion: 1,
    label: 'Media',
    mode: 'direct',
    history,
    lockDocuments: editorCollaboration,
    locales,
    upload: {
      filesRequiredOnCreate: false,
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      variants: [{ name: 'thumbnail', width: 320, height: 240, fit: 'inside' }],
    },
    fields: [
      { id: 'title', name: 'title', type: 'text', required: true, localized: true, maxLength: 256 },
      {
        id: 'alt',
        name: 'alt',
        type: 'text',
        localized: true,
        maxLength: 512,
        admin: {
          width: '50%',
          description: { en: 'Text describing this file.', 'zh-CN': '描述此文件的文字。' },
          placeholder: { en: 'Describe the file', 'zh-CN': '描述文件' },
        },
      },
      {
        id: 'copyright',
        name: 'copyright',
        type: 'text',
        maxLength: 256,
        admin: {
          position: 'sidebar',
          readOnly: true,
          description: { en: 'Managed through the API.', 'zh-CN': '通过 API 维护。' },
        },
      },
    ],
    search: ['title', 'alt', 'copyright'],
    defaultSort: [{ field: 'title', order: 'asc' }],
  },
  {
    id: 'settings',
    key: 'settings',
    schemaVersion: 1,
    label: 'Site settings',
    mode: 'direct',
    history,
    lockDocuments: editorCollaboration,
    locales,
    singleton: true,
    fields: [
      {
        id: 'site_name',
        name: 'siteName',
        type: 'text',
        required: true,
        localized: true,
        maxLength: 256,
      },
      {
        id: 'description',
        name: 'description',
        type: 'textarea',
        localized: true,
        maxLength: 2000,
      },
      { id: 'contact_email', name: 'contactEmail', type: 'email' },
    ],
  },
  {
    id: 'tags',
    key: 'tags',
    schemaVersion: 1,
    label: 'Tags',
    mode: 'direct',
    history,
    lockDocuments: editorCollaboration,
    locales,
    tags: { slugField: 'slug', collectionSpecific: true, joinField: { name: 'children' } },
    admin: {
      useAsTitle: 'title',
      defaultColumns: ['title', 'slug'],
      description: 'Organize content using nested tags.',
    },
    fields: [
      {
        id: 'title',
        name: 'title',
        label: 'Title',
        type: 'text',
        required: true,
        localized: true,
        maxLength: 256,
        index: true,
      },
      {
        id: 'slug',
        name: 'slug',
        label: 'Slug',
        type: 'text',
        required: true,
        localized: true,
        maxLength: 128,
        unique: true,
      },
    ],
    search: ['title', 'slug'],
    defaultSort: [{ field: 'title', order: 'asc' }],
  },
];

export const collections: readonly CollectionDefinition[] = [
  ...originalCollections,
  ...oneasterCollections,
];
