import {
  modelIdSchema,
  modelTasks,
  modelFeatures,
  inputModalities,
  outputModalities,
  flowKeys,
  profileKeys,
  validateApiBindings,
  validateDraftApiBindings,
} from '@new-cms/cms/content/delivery';
import type { DocumentData, FieldDefinition, JsonValue } from '@new-cms/cms/content/generate';
import {
  collection,
  field,
  group,
  text,
  rich,
  media,
  rows,
  select,
  relationship,
  seoFields,
  slugRule,
  localeRule,
  url,
  localizedRequired,
} from './fields.ts';
import { validProvenance } from './parameter-validation.ts';
import { parameterReference } from './parameter-reference.ts';
import { validParameterValues } from './parameter-value.ts';
import { presentModels } from './model-presentation.ts';
import { modelBindingDefaults } from './model-defaults.ts';
function bindingsRule(
  value: JsonValue,
  context: { data: DocumentData; mode: 'draft' | 'publish' },
) {
  if (context.mode === 'draft')
    return validateDraftApiBindings({
      modelId: typeof context.data['modelId'] === 'string' ? context.data['modelId'] : 'model',
      apiBindings: value,
      defaultBindingKey: context.data['defaultBindingKey'] ?? null,
    });
  try {
    validateApiBindings({
      modelId: typeof context.data['modelId'] === 'string' ? context.data['modelId'] : '',
      technicalCapabilities: context.data['technicalCapabilities'],
      apiBindings: value,
      defaultBindingKey: context.data['defaultBindingKey'] ?? null,
    });
    return true;
  } catch {
    return false;
  }
}
function apiBindings(): FieldDefinition {
  return {
    ...rows(
      'apiBindings',
      [
        text('key', 80, false),
        select('profileKey', profileKeys),
        select('inputModalities', inputModalities, true),
        select('outputModalities', outputModalities, true),
        select('capabilities', modelFeatures, true),
        select('enabledFlowKeys', flowKeys, true),
        field('constraints', 'json'),
        rows(
          'scenarios',
          [
            text('key', 80, false),
            localizedRequired('title', 256),
            text('description', 2000),
            select('flowKey', flowKeys),
            field('requestValues', 'json'),
          ],
          40,
        ),
        select('recipeKeys', ['core.http'], true),
        text('defaultScenarioKey', 80, false),
      ],
      20,
    ),
    defaultValue: [],
    hooks: {
      beforeValidate: [
        { version: 'model-binding-defaults.v1', run: ({ value }) => modelBindingDefaults(value) },
      ],
    },
    validate: { version: 'core-bindings.v2', run: bindingsRule },
  };
}
function contentFields() {
  return group('content', [
    rich('overview'),
    rich('strengths'),
    rich('limitations'),
    rich('useCases'),
    rich('selectionAdvice'),
    rich('quickStart'),
    rows('faq', [
      localizedRequired('question', 1000),
      localizedRequired('answer', 10000),
      url('sourceUrl'),
    ]),
    rows('sources', [
      localizedRequired('title', 256),
      url('url'),
      text('kind', 100, false),
      field('accessedAt', 'date'),
      field('supports', 'json', {
        defaultValue: [],
        validate: {
          version: 'source-supports.v1',
          run: (value, context) =>
            context.mode === 'draft' ||
            (Array.isArray(value) &&
              value.length <= 100 &&
              value.every(
                (item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 2000,
              )),
        },
      }),
    ]),
  ]);
}
function specifications() {
  return group('specifications', [
    group('text', [
      field('contextWindowTokens', 'number', { min: 1, precision: 0 }),
      field('maxOutputTokens', 'number', { min: 1, precision: 0 }),
      field('parameterCountBillions', 'number', { min: Number.MIN_VALUE }),
      text('licenseName'),
      url('licenseUrl'),
    ]),
    group('image', [
      text('maxResolution', 80, false),
      field('maxImagesPerRequest', 'number', { min: 1, precision: 0 }),
    ]),
    group('video', [
      field('maxDurationSeconds', 'number', { min: 1 }),
      text('maxResolution', 80, false),
    ]),
    group('embedding', [
      field('dimensions', 'number', { min: 1, precision: 0 }),
      field('maxInputTokens', 'number', { min: 1, precision: 0 }),
    ]),
    group('audio', [
      field('sampleRateHz', 'number', { min: 1, precision: 0 }),
      field('maxDurationSeconds', 'number', { min: 0 }),
      field('languages', 'json'),
    ]),
  ]);
}
export const models = presentModels(
  collection(
    'models',
    [
      field('modelId', 'text', {
        localized: false,
        required: true,
        unique: true,
        maxLength: 200,
        validate: {
          version: 'model-identity.v1',
          run: (value) => modelIdSchema.safeParse(value).success,
        },
      }),
      field('slug', 'text', {
        localized: false,
        required: true,
        unique: true,
        maxLength: 120,
        validate: slugRule,
      }),
      localizedRequired('title', 256),
      localizedRequired('summary', 2000),
      field('contentLocales', 'json', { required: true, validate: localeRule }),
      relationship('developer', 'developers'),
      text('family', 256, false),
      media('logo'),
      text('version', 200, false),
      select('versionKind', ['rolling', 'snapshot']),
      field('releaseDate', 'date'),
      url('officialUrl'),
      {
        ...select('primaryCategory', ['text', 'image', 'video', 'embedding', 'audio']),
        required: true,
      },
      group(
        'technicalCapabilities',
        [
          select('inputs', inputModalities, true),
          select('outputs', outputModalities, true),
          select('tasks', modelTasks, true),
          select('features', modelFeatures, true),
        ],
        {
          required: true,
          validate: {
            version: 'technical-declaration.v1',
            run: (value, context) =>
              context.mode === 'draft' ||
              (value !== null &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                Array.isArray(value['inputs']) &&
                value['inputs'].length > 0 &&
                Array.isArray(value['outputs']) &&
                value['outputs'].length > 0),
          },
        },
      ),
      parameterReference(),
      specifications(),
      apiBindings(),
      field('defaultBindingKey', 'text', { maxLength: 80, defaultValue: null }),
      contentFields(),
      rows(
        'showcase',
        [
          field('key', 'text', { required: true, maxLength: 80, validate: slugRule }),
          localizedRequired('title', 256),
          text('description', 2000),
          text('prompt', 10000),
          { ...select('mediaType', ['text', 'image', 'video', 'audio', 'none']), required: true },
          media('media'),
          media('poster'),
          text('alt', 512),
          text('outputText', 100000),
          field('settings', 'json', {
            validate: {
              version: 'parameter-values.v1',
              run: (value, context) => context.mode === 'draft' || validParameterValues(value),
            },
          }),
          field('provenance', 'json', {
            required: true,
            validate: { version: 'showcase-provenance.v1', run: validProvenance },
          }),
        ],
        100,
      ),
      group('presentation', [
        field('featured', 'boolean', { defaultValue: false }),
        field('sortOrder', 'number', { min: 0, precision: 0, defaultValue: 0 }),
        relationship('relatedModels', 'models', true),
      ]),
      seoFields(),
    ],
    {
      search: ['modelId', 'title', 'summary', 'family'],
      defaultSort: [{ field: 'presentation.sortOrder', order: 'asc' }],
    },
  ),
);
