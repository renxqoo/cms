import { expect, it } from 'vitest';
import { createRegistry, generateArtifacts, generateDataSchemas } from '../../generate.ts';
import {
  workflowCollections,
  contentCollection,
} from '../../../../../../test/support/content-runtime.ts';
import { contentLimits } from '../../../../../../test/support/content.ts';
import { resolveAdminMetadata } from '../admin-metadata.ts';
import { resolveLabel } from '../labels.ts';
import type { FieldDefinition } from '../../definition.ts';
import type { AdminComponentRegistration } from '../admin-types.ts';

const widget: AdminComponentRegistration = {
  id: 'site/widget',
  version: '1',
  slots: ['beforeInput', 'Cell', 'Filter'],
};
function configured(extra: Partial<FieldDefinition> = {}) {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    {
      id: 'widget',
      name: 'widget',
      type: 'ui',
      admin: { components: { beforeInput: ['site/widget'] } },
      ...extra,
    },
  ];
  return collections;
}

it('localized labels resolve exact language, language family and configured fallback', () => {
  expect(resolveLabel('Visible', 'zh', 'Fallback')).toBe('Visible');
  expect(
    resolveLabel({ en: 'Article', zh: '文章', 'zh-CN': '简体文章' }, 'zh-CN', 'Fallback'),
  ).toBe('简体文章');
  expect(resolveLabel({ en: 'Article', zh: '文章' }, 'zh-SG', 'Fallback')).toBe('文章');
  expect(resolveLabel({ en: 'Article' }, 'fr', 'Fallback')).toBe('Fallback');
  expect(resolveLabel(undefined, 'en', 'Fallback')).toBe('Fallback');
});

it('UI vessels need no Field component and do not change the physical mapping or read/write schemas', () => {
  const limits = contentLimits();
  const withUi = createRegistry({ collections: configured(), adminComponents: [widget], limits });
  const withoutUi = createRegistry({ collections: workflowCollections(), limits });
  const generated = generateArtifacts(withUi);
  expect(generated.mapping.get('articles').fingerprint).toBe(
    generateArtifacts(withoutUi).mapping.get('articles').fingerprint,
  );
  expect(withUi.behaviorHash).not.toBe(withoutUi.behaviorHash);
  expect(generated.schemas).toHaveProperty('articles.properties.title');
  expect(generated.schemas).not.toHaveProperty('articles.properties.widget');
  expect(generateDataSchemas(withUi, 'draft')).toHaveProperty('articles.properties.title');
  expect(generateDataSchemas(withUi, 'draft')).not.toHaveProperty('articles.properties.widget');
});

it.each<Partial<FieldDefinition>>([
  { required: true },
  { defaultValue: 'Not stored' },
  { unique: true },
  { access: { write: { version: 'write', run: () => true } } },
])(
  'UI storage settings are rejected instead of silently accepting a persisted field: %j',
  (extra) => {
    expect(() =>
      createRegistry({
        collections: configured(extra),
        adminComponents: [widget],
        limits: contentLimits(),
      }),
    ).toThrowError('invalid input');
  },
);

it('UI names share the existing sibling namespace and cannot shadow a stored field', () => {
  expect(() =>
    createRegistry({
      collections: configured({ name: 'title' }),
      adminComponents: [widget],
      limits: contentLimits(),
    }),
  ).toThrowError('invalid input');
});

it('trusted registration rejects wrong slots, unvalidated props, and duplicate view paths', () => {
  expect(() =>
    createRegistry({
      collections: configured({ admin: { components: { Field: 'site/widget' } } }),
      adminComponents: [widget],
      limits: contentLimits(),
    }),
  ).toThrowError('invalid input');
  expect(() =>
    createRegistry({
      collections: configured({
        admin: {
          components: { beforeInput: [{ id: 'site/widget', props: { caption: 'Unvalidated' } }] },
        },
      }),
      adminComponents: [widget],
      limits: contentLimits(),
    }),
  ).toThrowError('invalid input');
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.admin = {
    views: [
      { id: 'first', scope: 'document', path: 'report', label: 'First', component: false },
      { id: 'second', scope: 'document', path: 'report', label: 'Second', component: false },
    ],
  };
  expect(() => createRegistry({ collections, limits: contentLimits() })).toThrowError(
    'invalid input',
  );
  const invalid = {
    ...widget,
    resolveProps: { version: 'props', run: () => Promise.resolve({ caption: 'Unvalidated' }) },
  };
  expect(() =>
    createRegistry({
      collections: configured(),
      adminComponents: [invalid],
      limits: contentLimits(),
    }),
  ).toThrowError('invalid input');
});

it('metadata configuration consumes safe declared URLs and preserves title templates while resolving localized text', () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.admin = {
    meta: {
      metadataBase: 'https://cms.example.test',
      title: { default: 'Articles', template: '%s — Desk' },
      description: { en: 'English', zh: '中文' },
      titleSuffix: { en: ' — Desk', zh: ' — 管理' },
      icons: { icon: [{ url: '/icon.png', sizes: '32x32' }] },
      openGraph: { images: [{ url: 'https://cdn.example.test/card.png', alt: 'Preview' }] },
      alternates: {
        canonical: '/articles',
        languages: { en: '/en/articles', zh: [{ url: '/zh/articles', title: '中文' }] },
      },
      defaultOGImageType: 'static',
    },
  };
  const registry = createRegistry({ collections, limits: contentLimits() });
  expect(
    resolveAdminMetadata(registry.get('articles').admin?.meta, {
      locale: 'zh',
      fallbackLocale: 'en',
    }),
  ).toMatchObject({
    title: { default: 'Articles', template: '%s — Desk' },
    description: '中文',
    titleSuffix: ' — 管理',
    icons: { icon: [{ url: '/icon.png', sizes: '32x32' }] },
    defaultOGImageType: 'static',
  });
});
it.each([
  { metadataBase: 'not-an-absolute-base' },
  { openGraph: { images: [{ url: 'javascript:void(0)' }] } },
  { icons: { icon: 'data:image/png;base64,AA==' } },
  { alternates: { canonical: '//elsewhere.example.test/path' } },
  { twitter: { players: [{ playerUrl: 'file:///tmp/private' }] } },
  { unregisteredOption: 'value' },
  { defaultOGImageType: 'invalid' },
])(
  'metadata configuration refuses invalid URLs and unsupported options before rendering: %j',
  (meta) => {
    const collections = workflowCollections();
    contentCollection(collections, 'articles').admin = {};
    Reflect.set(contentCollection(collections, 'articles').admin ?? {}, 'meta', meta);
    expect(() => createRegistry({ collections, limits: contentLimits() })).toThrowError(
      'invalid input',
    );
  },
);

it('metadata text is safely preserved when it mentions a URL scheme without being a URL field', () => {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').admin = {
    meta: { title: 'javascript: URL examples', description: 'Data: quarterly report' },
  };
  const registry = createRegistry({ collections, limits: contentLimits() });
  expect(
    resolveAdminMetadata(registry.get('articles').admin?.meta, {
      locale: 'en',
      fallbackLocale: 'en',
    }),
  ).toEqual({ title: 'javascript: URL examples', description: 'Data: quarterly report' });
});
