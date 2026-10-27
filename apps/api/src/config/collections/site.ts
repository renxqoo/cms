import { validApiBaseUrl } from '@new-cms/cms/content/delivery';
import {
  collection,
  field,
  group,
  linkFields,
  localeRule,
  localizedRequired,
  media,
  rows,
  seoFields,
  text,
  slugRule,
} from './fields.ts';
export const site = collection(
  'site',
  [
    field('contentLocales', 'json', { required: true, validate: localeRule }),
    group('brand', [localizedRequired('name', 256), text('tagline', 2000), media('logo')]),
    localizedRequired('title', 256),
    localizedRequired('description', 2000),
    field('apiBaseUrl', 'text', {
      maxLength: 2048,
      validate: {
        version: 'core-api-base.v1',
        run: (value) => value === '' || validApiBaseUrl(value),
      },
    }),
    field('defaultDocumentSlug', 'text', {
      maxLength: 120,
      validate: slugRule,
      hooks: {
        beforeValidate: [
          {
            version: 'default-document-slug.v1',
            run: ({ value }) => {
              if (value !== undefined && value !== null && !slugRule.run(value))
                throw new Error('Invalid default document slug');
              return value;
            },
          },
        ],
      },
    }),
    group('header', [
      rows('navigation', [linkFields('link'), linkFields('homeLink')], 20),
      linkFields('consoleLink'),
    ]),
    group('footer', [
      rows('groups', [text('title'), rows('links', linkFields('link').fields ?? [], 30)], 20),
      text('copyright', 1000),
      text('disclaimer', 4000),
    ]),
    group(
      'ui',
      [
        'homeLabel',
        'skip',
        'language',
        'openNavigation',
        'closeNavigation',
        'mainNavigationLabel',
        'mobileNavigationLabel',
        'account',
        'register',
        'statusPreview',
        'backToTop',
      ].map((key) => text(key)),
    ),
    seoFields(),
  ],
  { singleton: true },
);
