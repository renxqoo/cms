import { expect, it } from 'vitest';
import { createRegistry, generateArtifacts } from '../../generate.ts';
import type { FieldDefinition } from '../../generate.ts';
import { contentDefinitions, contentLimits } from '../../../../../../test/support/content.ts';

function registry(field: FieldDefinition) {
  const collections = contentDefinitions();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles');
  articles.fields = [...articles.fields, field];
  return createRegistry({ collections, limits: contentLimits() });
}

it('accepts timezone true when Intl already includes UTC and generates each nested companion once', () => {
  const access = { read: { version: 'allowed', run: () => true } };
  const collection = registry({
    id: 'dates',
    type: 'tabs',
    tabs: [
      {
        id: 'dates_tab',
        name: 'dates',
        label: 'Dates',
        fields: [
          {
            id: 'start',
            name: 'start',
            type: 'date',
            localized: true,
            required: true,
            access,
            timezone: {
              supportedTimezones: [
                { value: 'UTC', label: { en: 'Universal', 'zh-CN': '协调世界时' } },
              ],
              override: {
                version: 'label',
                run: ({ baseField }) => ({ ...baseField, label: { en: 'Zone', 'zh-CN': '时区' } }),
              },
            },
          },
          {
            id: 'event_blocks',
            name: 'events',
            type: 'blocks',
            blocks: [
              {
                id: 'event_block',
                key: 'event',
                label: 'Event',
                fields: [
                  { id: 'finish', name: 'finish', type: 'date', timezone: true },
                  { id: 'plain_date', name: 'plain', type: 'date', timezone: false },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  const again = createRegistry({ collections: collection.list, limits: contentLimits() });
  expect(generateArtifacts(again).snapshot).toEqual(generateArtifacts(collection).snapshot);
  const tabs = again.get('articles').fields.find((field) => field.id === 'dates');
  const companion = tabs?.tabs?.[0]?.fields.find((field) => field.name === 'start_tz');
  expect(companion).toMatchObject({
    localized: true,
    required: true,
    defaultValue: 'UTC',
    label: { en: 'Zone' },
  });
  const nested = tabs?.tabs?.[0]?.fields.find((field) => field.name === 'events')?.blocks?.[0]
    ?.fields;
  expect(nested?.map((field) => field.name)).toEqual(['finish', 'finish_tz', 'plain']);
});

const invalidTimezones: NonNullable<FieldDefinition['timezone']>[] = [
  { supportedTimezones: ['Invalid/Zone'] },
  { supportedTimezones: ['UTC', 'Asia/Shanghai'], defaultTimezone: 'Europe/London' },
  {
    supportedTimezones: ['UTC'],
    override: { version: 'identity', run: ({ baseField }) => ({ ...baseField, name: 'other' }) },
  },
  {
    supportedTimezones: ['UTC'],
    override: { version: 'type', run: ({ baseField }) => ({ ...baseField, type: 'text' }) },
  },
  {
    supportedTimezones: ['UTC'],
    override: {
      version: 'options',
      run: ({ baseField }) => {
        const { options: _options, ...withoutOptions } = baseField;
        return withoutOptions;
      },
    },
  },
];
it.each(invalidTimezones.map((timezone) => ({ timezone })))(
  'rejects invalid timezone contracts before generation: %j',
  ({ timezone }) => {
    expect(() => registry({ id: 'event_date', name: 'eventDate', type: 'date', timezone })).toThrow(
      'invalid input',
    );
  },
);
