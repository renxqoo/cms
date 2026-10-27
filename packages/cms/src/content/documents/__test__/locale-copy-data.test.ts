import { z } from 'zod';
import { expect, it } from 'vitest';
import { copyLocaleData } from '../locale-copy-data.ts';
import { localeMediaSources } from '../copy-locale-media.ts';
import {
  contentCollection,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import { contentLimits } from '../../../../../../test/support/content.ts';
import type { FieldDefinition } from '../../definition.ts';

const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const third = '10000000-0000-4000-8000-000000000003';
const blocks: FieldDefinition = {
  id: 'layout',
  name: 'layout',
  type: 'blocks',
  localized: true,
  blocks: [
    {
      id: 'quote',
      key: 'quote',
      label: 'Quote',
      fields: [{ id: 'quote_text', name: 'text', type: 'text' }],
    },
    {
      id: 'note',
      key: 'note',
      label: 'Note',
      fields: [{ id: 'note_text', name: 'text', type: 'text' }],
    },
  ],
};
it('fills only same-type localized block rows and leaves additional destination rows intact', () => {
  const copied = copyLocaleData({
    fields: [blocks],
    overwrite: false,
    from: { layout: [{ id: first, blockType: 'quote', text: 'Copied' }] },
    to: {
      layout: [
        { id: second, blockType: 'quote', text: null },
        { id: third, blockType: 'note', text: 'Keep' },
      ],
    },
  });
  expect(copied.data['layout']).toEqual([
    { id: second, blockType: 'quote', text: 'Copied' },
    { id: third, blockType: 'note' },
  ]);
  expect(
    copyLocaleData({
      fields: [blocks],
      overwrite: false,
      from: { layout: [{ id: first, blockType: 'quote', text: 'Source' }] },
      to: { layout: [{ id: second, blockType: 'note', text: null }] },
    }).data,
  ).toEqual({});
});
it('does not rewrite shared containers, populated localized groups, virtual fields or joins', () => {
  const fields: FieldDefinition[] = [
    {
      id: 'shared',
      name: 'shared',
      type: 'array',
      fields: [{ id: 'shared_key', name: 'key', type: 'text' }],
    },
    {
      id: 'group',
      name: 'group',
      type: 'group',
      localized: true,
      fields: [{ id: 'group_text', name: 'text', type: 'text' }],
    },
    { id: 'virtual', name: 'computed', type: 'text', localized: true, virtual: true },
    {
      id: 'join',
      name: 'joined',
      type: 'join',
      join: { collection: 'articles', field: 'related' },
    },
  ];
  expect(
    copyLocaleData({
      fields,
      overwrite: false,
      from: {
        shared: [{ id: first, key: 'Stable' }],
        group: { text: 'Source' },
        computed: 'Derived',
        joined: [],
      },
      to: { shared: [{ id: first, key: 'Stable' }], group: { text: 'Keep' } },
    }).data,
  ).toEqual({});
});
it('copies explicit null containers in overwrite mode and leaves shared or populated destination containers unchanged in fill mode', () => {
  const fields: FieldDefinition[] = [
    { id: 'localized', name: 'localized', type: 'array', localized: true, fields: [] },
    { id: 'shared', name: 'shared', type: 'array', fields: [] },
    { id: 'group', name: 'group', type: 'group', localized: true, fields: [] },
  ];
  expect(
    copyLocaleData({
      fields,
      overwrite: true,
      from: { localized: null, shared: null, group: null },
      to: { localized: [], shared: [], group: {} },
    }).data,
  ).toEqual({ localized: null, group: null });
  expect(
    copyLocaleData({
      fields,
      overwrite: false,
      from: { localized: null, shared: null },
      to: { localized: [], shared: [] },
    }).data,
  ).toEqual({});
  expect(copyLocaleData({ fields, overwrite: false, from: { shared: [] }, to: {} }).data).toEqual(
    {},
  );
});
it('generates structural identities for localized source rows while leaving JSON identities as content', () => {
  const copied = copyLocaleData({
    overwrite: true,
    fields: [
      {
        id: 'rows',
        name: 'rows',
        type: 'array',
        localized: true,
        fields: [{ id: 'payload', name: 'payload', type: 'json' }],
      },
    ],
    from: { rows: [{ payload: { id: 'external' } }] },
    to: {},
  });
  const [row] = z
    .array(z.object({ id: z.uuid(), payload: z.object({ id: z.literal('external') }) }))
    .parse(copied.data['rows']);
  if (!row) throw new Error('Missing copied row');
  expect(copied.paths).toEqual({ [`rows.${row.id}.payload`]: 'rows.0.payload' });
});
it('maps many-valued media by exact field-prefix boundaries and rejects missing paths or mismatched source identities', () => {
  const collection = contentCollection(workflowCollections(), 'articles');
  collection.fields = [
    {
      id: 'photos',
      name: 'photos',
      type: 'upload',
      relationTo: ['media', 'other'],
      localized: true,
      hasMany: true,
    },
  ];
  const state = { collection, locale: 'zh' };
  const input = {
    runtime: { limits: contentLimits() },
    source: { photos: [{ collection: 'media', id: first }] },
    patch: { photos: [{ collection: 'media', id: first }] },
    fromLocale: 'en',
    paths: { photo: 'wrong', photos: 'photos' },
  };
  expect(localeMediaSources(state, input)).toEqual({
    'zh:photos.0': { path: 'en:photos.0', mediaDocumentId: first },
  });
  expect(() => localeMediaSources(state, { ...input, paths: {} })).toThrow('not found');
  expect(() =>
    localeMediaSources(state, {
      ...input,
      patch: { photos: [{ collection: 'media', id: second }] },
    }),
  ).toThrow('not found');
  expect(() =>
    localeMediaSources(state, {
      ...input,
      patch: { photos: [{ collection: 'other', id: first }] },
    }),
  ).toThrow('not found');
});
