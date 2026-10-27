import { expect, it } from 'vitest';
import { contentDefinitions, contentLimits } from '../../../../../../test/support/content.ts';
import { createRegistry } from '../../collections/create-registry.ts';
import { richTextReferences } from '../rich-text.ts';
import { validateData } from '../validate-data.ts';
import type { JsonValue } from '../../definition.ts';

function validate(body: JsonValue) {
  return validateData({
    collection: createRegistry({ collections: contentDefinitions(), limits: contentLimits() }).get(
      'articles',
    ),
    data: { title: 'Formatted article', body },
    mode: 'publish',
    locale: 'en',
    limits: contentLimits(),
  });
}

it('regression: formatted text, every heading level and structured lists survive content validation', async () => {
  const body = {
    version: 1,
    children: [
      {
        type: 'heading',
        level: 1,
        align: 'center',
        children: [{ type: 'text', text: 'Title', format: ['bold', 'italic'] }],
      },
      {
        type: 'paragraph',
        indent: 2,
        align: 'justify',
        children: [{ type: 'text', text: 'Body', format: ['underline', 'strikethrough', 'code'] }],
      },
      { type: 'quote', children: [{ type: 'text', text: 'Quote', format: ['superscript'] }] },
      {
        type: 'list',
        kind: 'number',
        start: 3,
        children: [{ type: 'listItem', children: [{ type: 'text', text: 'Ordered' }] }],
      },
      {
        type: 'list',
        kind: 'check',
        children: [
          {
            type: 'listItem',
            checked: true,
            children: [{ type: 'text', text: 'Done', format: ['subscript'] }],
          },
        ],
      },
      { type: 'horizontalRule' },
    ],
  };
  expect((await validate(body))['body']).toEqual(body);
  for (const level of [1, 2, 3, 4, 5, 6])
    expect(
      (await validate({ version: 1, children: [{ type: 'heading', level, children: [] }] }))[
        'body'
      ],
    ).toMatchObject({ children: [{ level }] });
});

it.each<JsonValue>([
  { type: 'text', text: 'unsafe', format: ['unknown'] },
  { type: 'text', text: 'unsafe', format: ['bold', 'bold'] },
  { type: 'text', text: 'unsafe', style: 'background:url(javascript:alert(1))' },
  { type: 'text', text: 'unsafe', format: ['subscript', 'superscript'] },
  { type: 'heading', level: 7, children: [] },
  { type: 'paragraph', align: 'start; color:red', children: [] },
  { type: 'paragraph', indent: 9, children: [] },
  { type: 'list', kind: 'number', start: 0, children: [] },
  { type: 'list', kind: 'bullet', start: 2, children: [] },
  { type: 'list', kind: 'unknown', children: [] },
  { type: 'listItem', checked: 'true', children: [] },
  { type: 'horizontalRule', children: [] },
])('rejects invalid rich text formatting without admitting arbitrary styles: %j', async (node) => {
  await expect(validate({ version: 1, children: [node] })).rejects.toThrowError('invalid input');
});

it('internal document links preserve stable references while keeping their formatted children', async () => {
  const body = {
    version: 1,
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            reference: { collection: 'pages', id: '10000000-0000-4000-8000-000000000003' },
            children: [{ type: 'text', text: 'Document label', format: ['bold'] }],
          },
        ],
      },
    ],
  };
  expect((await validate(body))['body']).toEqual(body);
  expect(
    richTextReferences({ value: body, path: 'body', fieldId: 'body', limits: contentLimits() }),
  ).toEqual([
    {
      collection: 'pages',
      id: '10000000-0000-4000-8000-000000000003',
      path: 'body.children.0.children.0.reference',
      fieldId: 'body',
      onDelete: 'restrict',
      media: false,
    },
  ]);
});
