import type { CollectionDefinition, FieldDefinition } from '@new-cms/cms/content/generate';
import type { ContentDeliveryOptions } from '../../packages/cms/src/content/delivery/types.ts';
function field(
  name: string,
  type: FieldDefinition['type'],
  extra: Partial<FieldDefinition> = {},
): FieldDefinition {
  return {
    id: name.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`),
    name,
    type,
    ...extra,
  };
}

const collection = (
  key: string,
  fields: FieldDefinition[],
  mode: 'direct' | 'drafts' = 'drafts',
): CollectionDefinition => ({
  id: `public_${key.replaceAll('-', '_')}`,
  key,
  schemaVersion: 1,
  label: key,
  mode,
  history: { maxVersions: 100, retentionMs: 0 },
  locales: { default: 'en', supported: ['en', 'zh', 'fr'], fallback: {} },
  fields,
});
const contentLocales = () => field('contentLocales', 'json');
const title = () => field('title', 'text', { localized: true });
const capabilities = field('technicalCapabilities', 'group', {
  fields: ['inputs', 'outputs', 'tasks', 'features'].map((name) =>
    field(name, 'select', {
      hasMany: true,
      options: [
        'text',
        'image',
        'video',
        'audio',
        'embedding',
        'chat',
        'vision',
        'streaming',
        'embedding-generation',
      ],
    }),
  ),
});
const model = collection('models', [
  field('modelId', 'text', { unique: true }),
  field('slug', 'text', { unique: true }),
  title(),
  field('summary', 'text', { localized: true }),
  contentLocales(),
  field('primaryCategory', 'select', {
    options: ['text', 'image', 'video', 'audio', 'embedding'],
  }),
  capabilities,
  field('apiBindings', 'array', { fields: [field('key', 'text'), field('profileKey', 'text')] }),
  field('defaultBindingKey', 'text'),
  field('content', 'json', { localized: true }),
  field('developer', 'relationship', { relationTo: ['developers'] }),
  field('presentation', 'group', {
    fields: [
      field('sortOrder', 'number'),
      field('featured', 'boolean'),
      field('relatedModels', 'relationship', { relationTo: ['models'], hasMany: true }),
    ],
  }),
  field('seo', 'group', { fields: [field('allowIndex', 'boolean')] }),
]);
model.search = ['title', 'modelId'];
model.publicationLocalesField = 'contentLocales';
const documents = collection('documents', [
  field('slug', 'text'),
  title(),
  field('summary', 'text'),
  contentLocales(),
  field('navigationLabel', 'text'),
  field('order', 'number'),
  field('body', 'json'),
]);
const site = collection('site', [title(), contentLocales(), field('defaultDocumentSlug', 'text')]);
const home = collection('home', [contentLocales(), field('hero', 'json')]);
const developers = collection('developers', [field('name', 'text'), contentLocales()]);
const languages = collection(
  'languages',
  [
    field('code', 'text'),
    field('label', 'text'),
    field('shortLabel', 'text'),
    field('htmlLang', 'text'),
    field('direction', 'select', { options: ['ltr', 'rtl'] }),
    field('enabled', 'boolean'),
    field('default', 'boolean'),
  ],
  'direct',
);
const messageBundles = collection(
  'message-bundles',
  [
    field('contractVersion', 'text'),
    field('locale', 'text'),
    field('namespace', 'text'),
    field('messages', 'json'),
  ],
  'direct',
);
const definitions = [model, documents, site, home, developers, languages, messageBundles];

export function publicCollections(): CollectionDefinition[] {
  return structuredClone(definitions);
}
export function publicDeliveryOptions(): ContentDeliveryOptions {
  return {
    clientOrigin: 'https://client.example.test',
    policy: {
      maxResponseBytes: 2097152,
      maxSqlQueries: 200,
      readTimeoutMs: 4000,
      maxNavigationItems: 100,
      maxRelatedItems: 6,
      exportBatchSize: 100,
      exportMaxSqlQueries: 10000,
      exportMaxItems: 100000,
      exportMaxBytes: 33554432,
      exportMaxFrameBytes: 262144,
      exportTimeoutMs: 15000,
      exportWriteTimeoutMs: 2000,
      previewTtlMs: 600000,
      previewMaxActivePerIssuer: 20,
      previewMaxActive: 10000,
    },
    examplePolicy: {
      requestTimeoutMs: 60000,
      pollIntervalMs: 2000,
      pollDeadlineMs: 600000,
      maxResponseBytes: 8388608,
    },
    messageContracts: [
      {
        version: 'oneaster-ui.test',
        availableUntil: null,
        validate: (messages) => messages['site'] !== undefined,
      },
    ],
  };
}
