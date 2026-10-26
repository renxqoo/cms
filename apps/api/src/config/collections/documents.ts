import type { BlockDefinition } from '@new-cms/cms/content/generate';
import {
  collection,
  field,
  group,
  linkFields,
  localizedRequired,
  media,
  rich,
  rows,
  select,
  seoFields,
  slugRule,
  text,
  relationship,
  localeRule,
} from './fields.ts';
function callout(name: string) {
  return group(name, [select('tone', ['info', 'warning']), text('title'), rich('body')]);
}
function cta(name: string) {
  return group(name, [text('eyebrow'), text('title'), linkFields('link')]);
}
const documentBlocks: BlockDefinition[] = [
  { id: 'richText', key: 'rich_text', label: 'Rich text', fields: [rich('body')] },
  {
    id: 'callout',
    key: 'callout',
    label: 'Callout',
    fields: [select('tone', ['info', 'warning']), text('title'), rich('body')],
  },
  {
    id: 'steps',
    key: 'steps',
    label: 'Steps',
    fields: [rows('items', [text('title'), rich('body')])],
  },
  {
    id: 'code',
    key: 'code',
    label: 'Code',
    fields: [
      select('language', [
        'text',
        'bash',
        'python',
        'javascript',
        'typescript',
        'go',
        'java',
        'php',
        'json',
      ]),
      field('code', 'code', { localized: true, maxLength: 100000 }),
      text('caption', 2000),
    ],
  },
  {
    id: 'codeTabs',
    key: 'code_tabs',
    label: 'Code tabs',
    fields: [
      text('label'),
      rows(
        'items',
        [
          text('key', 80, false),
          text('label'),
          select('language', [
            'text',
            'bash',
            'python',
            'javascript',
            'typescript',
            'go',
            'java',
            'php',
            'json',
          ]),
          field('code', 'code', { localized: true, maxLength: 100000 }),
        ],
        10,
      ),
      text('caption', 2000),
    ],
  },
  {
    id: 'endpoint',
    key: 'endpoint',
    label: 'Endpoint',
    fields: [
      select('method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      text('path', 2048, false),
      rows('headers', [text('name', 200, false), text('value', 2000, false)], 30),
    ],
  },
  {
    id: 'fieldTable',
    key: 'field_table',
    label: 'Field table',
    fields: [
      text('caption'),
      text('fieldLabel'),
      text('typeLabel'),
      text('descriptionLabel'),
      rows('rows', [text('name', 256, false), text('valueType'), rich('description')]),
    ],
  },
  {
    id: 'accordion',
    key: 'accordion',
    label: 'Accordion',
    fields: [rows('items', [text('question', 1000), rich('answer')])],
  },
  {
    id: 'cta',
    key: 'cta',
    label: 'Call to action',
    fields: [text('eyebrow'), text('title'), linkFields('link')],
  },
  { id: 'image', key: 'image', label: 'Image', fields: [media('asset'), text('caption', 2000)] },
];
export const documents = collection(
  'documents',
  [
    field('slug', 'text', { unique: true, required: true, maxLength: 120, validate: slugRule }),
    localizedRequired('title', 256),
    localizedRequired('summary', 2000),
    text('navigationLabel'),
    field('order', 'number', { min: 0, defaultValue: 0, precision: 0 }),
    field('contentLocales', 'json', { required: true, validate: localeRule }),
    relationship('relatedModels', 'models', true),
    group(
      'body',
      [
        group('introduction', [text('eyebrow'), text('title'), rich('body'), callout('callout')]),
        rows(
          'sections',
          [
            text('anchor', 120, false),
            text('title'),
            text('navigationLabel'),
            field('blocks', 'blocks', { blocks: documentBlocks, max: 30, defaultValue: [] }),
          ],
          30,
        ),
        cta('next'),
      ],
      { required: true },
    ),
    seoFields(),
  ],
  { search: ['title', 'summary'], defaultSort: [{ field: 'order', order: 'asc' }] },
);
