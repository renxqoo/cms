import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { DocumentData, JsonValue } from '@new-cms/cms/content/generate';
import {
  editorialFixture,
  nativeDocument,
  paragraph,
} from '../../../../../../test/support/oneaster-editorial.ts';
import { validatePublicMedia } from '../publication-media.ts';
import { validPublicLink } from '../public-link.ts';
import { validPublicRichText } from '../public-rich-text.ts';

function identify(value: JsonValue) {
  if (Array.isArray(value))
    for (const item of value) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item))
        item['id'] = randomUUID();
      identify(item);
    }
  else if (value !== null && typeof value === 'object')
    for (const child of Object.values(value)) identify(child);
}

function document(): DocumentData {
  const data: DocumentData = nativeDocument();

  identify(data);
  return data;
}
function valid(
  collection: string,
  data: DocumentData,
  media: { sourcePath: string; mimeType: string }[] = [],
) {
  return validatePublicMedia({ collection, data, media });
}
it('requires complete page copy while preserving optional assets, links and document navigation labels', () => {
  expect(valid('home', editorialFixture('home'))).toBe(true);
  expect(valid('site', editorialFixture('site'))).toBe(true);
  expect(valid('documents', document())).toBe(true);
  for (const collection of ['home', 'site', 'documents'])
    expect(valid(collection, { contentLocales: ['en'] })).toBe(false);
  const home = editorialFixture('home');
  const variants: DocumentData[] = [
    { ...home, hero: null },
    { ...home, hero: 'invalid' },
    { ...home, workspace: [] },
    { ...home, useCases: false },
    { ...home, closing: { title: ' ' } },
  ];
  for (const data of variants) expect(valid('home', data)).toBe(false);
});
it('rejects missing or repeated required homepage capability, workspace and use-case entries', () => {
  const home = editorialFixture('home');
  for (const path of [
    ['hero', 'capabilities'],
    ['workspace', 'views'],
    ['useCases', 'items'],
  ]) {
    const [group = '', name = ''] = path;
    const data = structuredClone(home);
    const source = data[group];
    if (
      source === null ||
      typeof source !== 'object' ||
      Array.isArray(source) ||
      !Array.isArray(source[name])
    )
      throw new Error('Missing fixture rows');
    const rows = source[name];
    source[name] = rows.slice(1);
    expect(valid('home', data)).toBe(false);
    source[name] = [rows[0] ?? null, rows[0] ?? null, rows[2] ?? null];
    expect(valid('home', data)).toBe(false);
  }
});
it('rejects duplicate homepage FAQ identities before publication', () => {
  const data = editorialFixture('home');
  const { faq } = data;
  if (!faq || typeof faq !== 'object' || Array.isArray(faq) || !Array.isArray(faq['items']))
    throw new Error('Missing FAQ fixture');
  const [first] = faq['items'];
  if (!first || typeof first !== 'object' || Array.isArray(first))
    throw new Error('Missing FAQ row');
  faq['items'] = [first, { ...first, id: randomUUID() }];
  expect(valid('home', data)).toBe(false);
});
it.each([
  { kind: 'internal', label: 'Docs', path: '/docs', anchor: 'quickstart' },
  { kind: 'external', label: 'Source', url: 'https://example.com/reference' },
  { kind: 'action', label: 'Console', action: 'console', section: null },
])('accepts the active fields of each public link variant: $kind', (value) =>
  expect(validPublicLink(value)).toBe(true),
);
it.each([
  null,
  {},
  { kind: 'unknown', label: 'Link' },
  { kind: 'internal', label: ' ', path: '/docs' },
  { kind: 'internal', label: 'Docs', path: '//evil.com' },
  { kind: 'internal', label: 'Docs', path: '/%2e%2e/private' },
  { kind: 'internal', label: 'Docs', path: '/%' },
  { kind: 'internal', label: 'Docs', path: '/docs', anchor: 'Bad_anchor' },
  { kind: 'action', label: 'Console', action: 'delete' },
  { kind: 'action', label: 'Console', action: 'console', section: 'unknown' },
  { kind: 'external', label: 'Source', url: 'http://example.com' },
  { kind: 'external', label: 'Source', url: 'https://user:pass@example.com' },
  { kind: 'external', label: 'Source', url: 'https://example.com/\n' },
  { kind: 'external', label: 'Source', url: '%' },
])('rejects unsafe or incomplete link %#', (value) => expect(validPublicLink(value)).toBe(false));

it('rejects repeated DOM identities, reserved anchors, empty code tabs and document budgets before publication', () => {
  const original = document();
  const source = original['body'];
  if (
    source === null ||
    typeof source !== 'object' ||
    Array.isArray(source) ||
    !Array.isArray(source['sections'])
  )
    throw new Error('Missing fixture sections');
  const [section] = source['sections'];
  if (section === null || typeof section !== 'object' || Array.isArray(section))
    throw new Error('Missing fixture section');
  for (const anchor of ['docs-title', 'docs-next', 'docs-introduction-callout', 'Bad_anchor'])
    expect(
      valid('documents', { ...original, body: { ...source, sections: [{ ...section, anchor }] } }),
    ).toBe(false);
  expect(
    valid('documents', {
      ...original,
      body: {
        ...source,
        sections: Array.from({ length: 31 }, () => ({
          ...section,
          id: randomUUID(),
          anchor: `section-${randomUUID()}`,
        })),
      },
    }),
  ).toBe(false);
  expect(
    valid('documents', {
      ...original,
      body: {
        ...source,
        sections: [
          {
            ...section,
            blocks: [{ id: randomUUID(), blockType: 'code_tabs', label: 'SDKs', items: [] }],
          },
        ],
      },
    }),
  ).toBe(false);
  expect(
    valid('documents', {
      ...original,
      body: {
        ...source,
        sections: [{ ...section, blocks: [{ id: randomUUID(), blockType: 'rich_text' }] }],
      },
    }),
  ).toBe(false);
});
it('permits only matching pinned showcase assets and image assets in page and document content', () => {
  const id = randomUUID();
  for (const [mediaType, mimeType] of [
    ['image', 'image/png'],
    ['audio', 'audio/mpeg'],
    ['audio', 'audio/wav'],
    ['video', 'video/mp4'],
  ] as const) {
    const data = { showcase: [{ id, key: 'sample', mediaType }] };
    expect(valid('models', data, [{ sourcePath: `showcase.${id}.media`, mimeType }])).toBe(true);
    expect(
      valid('models', data, [{ sourcePath: `showcase.${id}.media`, mimeType: 'application/pdf' }]),
    ).toBe(false);
    expect(valid('models', data)).toBe(false);
  }
  expect(
    valid('models', {
      showcase: [{ id, key: 'answer', mediaType: 'text', outputText: 'An answer' }],
    }),
  ).toBe(true);
  expect(
    valid(
      'models',
      { showcase: [{ id, key: 'answer', mediaType: 'text', outputText: 'An answer' }] },
      [{ sourcePath: `showcase.${id}.media`, mimeType: 'image/png' }],
    ),
  ).toBe(false);
  expect(
    valid('models', {
      showcase: [
        { id, key: 'answer', mediaType: 'none' },
        { id: randomUUID(), key: 'answer', mediaType: 'none' },
      ],
    }),
  ).toBe(false);
  expect(valid('developers', {}, [{ sourcePath: 'logo', mimeType: 'video/mp4' }])).toBe(false);
  expect(valid('developers', {}, [{ sourcePath: 'logo', mimeType: 'image/webp' }])).toBe(true);
  expect(valid('articles', {}, [{ sourcePath: 'cover', mimeType: 'application/pdf' }])).toBe(true);
});
it('enforces the public rich-text grammar and a shared total-node budget', () => {
  expect(validPublicRichText(paragraph)).toBe(true);
  expect(
    validPublicRichText({
      version: 1,
      children: [{ type: 'list', children: [{ type: 'listItem', children: paragraph.children }] }],
    }),
  ).toBe(true);
  for (const node of [
    null,
    { type: 'text', text: 'Top level' },
    { type: 'link', url: 'https://example.com', children: [] },
    { type: 'listItem', children: [] },
    { type: 'unknown', children: [] },
    { type: 'paragraph', children: [{ type: 'media', collection: 'media', id: randomUUID() }] },
  ])
    expect(validPublicRichText({ version: 1, children: [node] })).toBe(false);
  for (const url of ['https://example.com/docs', '/docs#start'])
    expect(
      validPublicRichText({
        version: 1,
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'link', url, children: [{ type: 'text', text: 'Docs' }] }],
          },
        ],
      }),
    ).toBe(true);
  for (const url of [
    'mailto:user@example.com',
    'javascript:alert(1)',
    'https://u:p@example.com',
    '//evil.com',
    '/%2e%2e/private',
    '/%',
    '/%5cprivate',
  ])
    expect(
      validPublicRichText({
        version: 1,
        children: [{ type: 'paragraph', children: [{ type: 'link', url, children: [] }] }],
      }),
    ).toBe(false);
  expect(
    validPublicRichText({
      version: 1,
      children: Array.from({ length: 2499 }, () => paragraph.children[0] ?? null),
    }),
  ).toBe(true);
  expect(
    validPublicRichText({
      version: 1,
      children: Array.from({ length: 2500 }, () => paragraph.children[0] ?? null),
    }),
  ).toBe(false);
  let deep: JsonValue = { type: 'paragraph', children: [] };
  for (let i = 0; i < 17; i++)
    deep = { type: 'listItem', children: [{ type: 'list', children: [deep] }] };
  expect(validPublicRichText({ version: 1, children: [deep] })).toBe(false);
});
