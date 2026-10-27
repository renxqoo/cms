import { expect, it } from 'vitest';
import { collectionEditorSchema } from '../../../contracts/editor';
import { node } from './support';

it('validates safe recursive metadata and rejects unknown controls or action payloads', () => {
  const metadata = {
    collection: 'pages',
    schemaVersion: 1,
    behaviorHash: 'behavior',
    mappingFingerprint: 'mapping',
    intent: 'create',
    mode: 'editing',
    locale: 'en',
    fallback: [],
    richTextNodes: [],
    initialData: null,
    initialSnapshot: null,
    visibility: {},
    componentVersions: {},
    document: null,
    locales: { default: 'en', supported: ['en', 'zh-CN'], fallback: { 'zh-CN': ['en'] } },
    layout: [
      node('Layout', {
        name: undefined,
        type: 'tabs',
        tabs: [
          {
            id: 'main',
            name: 'main',
            label: 'Main',
            children: [
              node('Group', {
                type: 'group',
                children: [
                  node('Blocks', {
                    type: 'blocks',
                    blocks: [{ id: 'hero', key: 'hero', label: 'Hero', children: [node('Title')] }],
                  }),
                ],
              }),
            ],
          },
        ],
      }),
    ],
    schemas: { read: { type: 'object' }, draft: { type: 'object' }, commit: { type: 'object' } },
    actions: [{ operationId: 'documents.create', state: 'conditional' }],
    upload: null,
  };
  expect(collectionEditorSchema.safeParse(metadata).success).toBe(true);
  expect(
    collectionEditorSchema.safeParse({
      ...metadata,
      layout: [{ ...node('Unknown'), type: 'html' }],
    }).success,
  ).toBe(false);
  expect(
    collectionEditorSchema.safeParse({
      ...metadata,
      actions: [{ operationId: 'unsafe', state: 'allowed' }],
    }).success,
  ).toBe(false);
  expect(
    collectionEditorSchema.safeParse({
      ...metadata,
      layout: [{ ...node('Title'), privatePredicate: 'secret' }],
    }).success,
  ).toBe(false);
  expect(
    collectionEditorSchema.safeParse({
      ...metadata,
      upload: {
        mimeTypes: ['image/png'],
        maxBytes: 1000,
        maxOutputBytes: 2000,
        maxPixels: 10000,
        maxFrames: 1,
        maxWidth: 100,
        maxHeight: 100,
        maxVariants: 1,
        recipe: {
          variants: [
            { name: 'thumb', width: 40, height: 30, format: 'png', fit: 'cover', quality: 90 },
          ],
        },
        filesRequiredOnCreate: true,
        directUpload: false,
        multipart: false,
      },
    }).success,
  ).toBe(true);
});
