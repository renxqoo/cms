import type { FieldPolicyContext } from '@new-cms/cms/content/generate';
import {
  collection,
  field,
  localizedRequired,
  media,
  url,
  validLocale,
  localeRule,
} from './fields.ts';
import { models } from './models.ts';
import { documents } from './documents.ts';
import { site } from './site.ts';
import { home } from './home.ts';
import { interfaceMessageContract, validateMessageNamespace } from '../message-contract.ts';
const developers = collection('developers', [
  field('contentLocales', 'json', { required: true, validate: localeRule }),
  field('key', 'text', { unique: true, required: true, maxLength: 120 }),
  localizedRequired('name', 256),
  media('logo'),
  url('website'),
]);
const createOnly = {
  version: 'identity-create-only.v1',
  run: (context: FieldPolicyContext) => context.operation === 'documents.create',
};
const retainedAccess = Object.fromEntries(
  ['documents.archive', 'documents.purge', 'documents.copy'].map((operation) => [
    operation,
    { version: 'retained-record.v1', run: () => false },
  ]),
);
const languages = collection(
  'languages',
  [
    field('code', 'text', {
      required: true,
      unique: true,
      maxLength: 32,
      access: { write: createOnly },
      validate: {
        version: 'bcp47-code.v1',
        run: (value) => typeof value === 'string' && validLocale(value),
      },
    }),
    { ...localizedRequired('label', 256), localized: false },
    field('shortLabel', 'text', {
      maxLength: 80,
      validate: {
        version: 'language-label.v1',
        run: (value) => typeof value === 'string' && (value === '' || value.trim().length > 0),
      },
    }),
    field('htmlLang', 'text', {
      maxLength: 32,
      validate: {
        version: 'html-language.v1',
        run: (value) => value === '' || (typeof value === 'string' && validLocale(value)),
      },
    }),
    field('direction', 'select', { options: ['ltr', 'rtl'], required: true }),
    field('enabled', 'boolean', { defaultValue: false }),
    field('default', 'boolean', {
      defaultValue: false,
      access: {
        write: {
          version: 'language-default.v1',
          run: (context) =>
            context.operation === 'documents.create' ||
            context.operation === 'languages.setDefault',
        },
      },
    }),
  ],
  {
    access: retainedAccess,
    mode: 'direct',
    locales: { default: 'en', supported: ['en'], fallback: { en: [] } },
  },
);
const messageBundles = collection(
  'message-bundles',
  [
    field('contractVersion', 'text', {
      required: true,
      maxLength: 80,
      access: { write: createOnly },
    }),
    field('locale', 'text', {
      access: { write: createOnly },
      required: true,
      maxLength: 32,
      validate: {
        version: 'bcp47-code.v1',
        run: (value) => typeof value === 'string' && validLocale(value),
      },
    }),
    field('namespace', 'text', { required: true, maxLength: 120, access: { write: createOnly } }),
    field('messages', 'json', {
      required: true,
      validate: {
        version: 'software-messages.v5',
        run: (value, context) =>
          context.data['contractVersion'] === interfaceMessageContract.version &&
          typeof context.data['namespace'] === 'string' &&
          validateMessageNamespace(context.data['namespace'], value),
      },
    }),
  ],
  {
    indexes: [
      {
        id: 'message_bundle_identity',
        fields: ['contractVersion', 'locale', 'namespace'],
        unique: true,
      },
    ],
    access: retainedAccess,
    mode: 'direct',
    locales: { default: 'en', supported: ['en'], fallback: { en: [] } },
  },
);
export const oneasterCollections = [
  developers,
  models,
  documents,
  site,
  home,
  languages,
  messageBundles,
];
