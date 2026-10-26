import type { CollectionDefinition } from '@new-cms/cms/content/generate';
import { oneasterCollections } from './oneaster.ts';

const locales = {
  default: 'en',
  supported: ['en', 'zh-CN'],
  fallback: { en: [], 'zh-CN': ['en'] },
} as const;
const history = { maxVersions: 100, retentionMs: 604_800_000 };

const originalCollections: readonly CollectionDefinition[] = [
  {
    id: 'articles',
    key: 'articles',
    schemaVersion: 1,
    label: 'Articles',
    mode: 'drafts',
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
  },
  {
    id: 'pages',
    key: 'pages',
    schemaVersion: 1,
    label: 'Pages',
    mode: 'drafts',
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
      { id: 'body', name: 'body', type: 'richText', localized: true },
      { id: 'parent', name: 'parent', type: 'relationship', relationTo: ['pages'] },
    ],
    search: ['title'],
    defaultSort: [{ field: 'title', order: 'asc' }],
  },
  {
    id: 'media',
    key: 'media',
    schemaVersion: 1,
    label: 'Media',
    mode: 'direct',
    history,
    locales,
    upload: {
      mimeTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'audio/mpeg',
        'audio/wav',
        'video/mp4',
      ],
      variants: [{ name: 'thumbnail', width: 320, height: 240, fit: 'inside' }],
    },
    fields: [
      { id: 'title', name: 'title', type: 'text', required: true, localized: true, maxLength: 256 },
      { id: 'alt', name: 'alt', type: 'text', localized: true, maxLength: 512 },
      { id: 'copyright', name: 'copyright', type: 'text', maxLength: 256 },
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
];

export const collections: readonly CollectionDefinition[] = [
  ...originalCollections,
  ...oneasterCollections,
];
