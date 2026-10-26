import {
  collection,
  field,
  group,
  linkFields,
  localeRule,
  media,
  relationship,
  rows,
  select,
  seoFields,
  text,
  slugRule,
} from './fields.ts';
function heading(eyebrow = false) {
  return group('heading', [
    ...(eyebrow ? [text('eyebrow')] : []),
    text('title'),
    text('description', 2000),
  ]);
}
function linePair(name: string) {
  return field(name, 'json', {
    localized: true,
    validate: {
      version: 'two-lines.v1',
      run: (value) =>
        Array.isArray(value) &&
        value.length === 2 &&
        value.every(
          (line) => typeof line === 'string' && line.trim().length > 0 && line.length <= 2000,
        ),
    },
  });
}
function ui(name: string, keys: readonly string[]) {
  return group(
    name,
    keys.map((key) => text(key)),
  );
}
function hero() {
  return group('hero', [
    group(
      'title',
      ['label', 'lead', 'separator', 'tail'].map((key) => text(key)),
    ),
    text('subtitle', 4000),
    group('apiExample', [select('method', ['POST'])]),
    linkFields('primaryLink'),
    rows(
      'capabilities',
      [
        select('kind', ['routing', 'keys', 'usage']),
        text('accessibleLabel'),
        text('eyebrow'),
        linePair('titleLines'),
        linePair('descriptionLines'),
        linkFields('link'),
      ],
      3,
    ),
    rows('providers', [relationship('developer', 'developers'), text('name'), media('logo')], 50),
    rows(
      'routingProviders',
      [relationship('developer', 'developers'), text('name'), text('series'), media('logo')],
      50,
    ),
    group('ui', [
      text('copyEndpoint'),
      ui('carousel', ['label', 'previous', 'next']),
      ui('keysPreview', ['apiKeys', 'newKey', 'monthlyBudget']),
      ui('usagePreview', ['monthlyRequests', 'monthlySpend', 'sampleData']),
    ]),
  ]);
}
function featuredModels() {
  return group('featuredModels', [
    heading(),
    linkFields('catalogLink'),
    relationship('models', 'models', true),
    group(
      'ui',
      ['input', 'output', 'viewModel', 'viewDetails']
        .map((key) => text(key))
        .concat([ui('uses', ['general', 'coding', 'long', 'everyday', 'writing', 'light'])]),
    ),
  ]);
}
const workspaceKeys = [
  'navigation',
  'sampleData',
  'sampleLabel',
  'demoWorkspace',
  'overview',
  'apiKeys',
  'usage',
  'date',
  'illustrative',
  'totalRequests',
  'acrossKeys',
  'totalSpend',
  'sampleActivity',
  'requestsOverTime',
  'shortDate',
  'oct1',
  'oct10',
  'oct20',
  'spendByProject',
  'projectKeys',
  'activeKeys',
  'active',
  'monthlyBudget',
  'ofBudget',
  'budgetNote',
  'latestRequests',
  'time',
  'model',
  'tokens',
  'cost',
  'recentRequests',
  'requestNote',
];
function workspace() {
  return group('workspace', [
    group('emptyState', [text('title'), text('description', 2000)]),
    group('heading', [text('accessibleLabel'), linePair('titleLines'), text('description', 2000)]),
    linkFields('consoleLink'),
    rows(
      'views',
      [
        select('kind', ['overview', 'keys', 'usage']),
        text('title'),
        text('description', 2000),
        text('navigationLabel'),
        text('previewTitle'),
      ],
      3,
    ),
    group('quickstart', [
      text('title'),
      rows('steps', [text('numberLabel'), text('title')], 10),
      linkFields('link'),
      ui('ui', ['symbol']),
    ]),
    ui('ui', workspaceKeys),
  ]);
}
export const home = collection(
  'home',
  [
    field('contentLocales', 'json', { required: true, validate: localeRule }),
    hero(),
    featuredModels(),
    workspace(),
    group('useCases', [
      heading(true),
      rows(
        'items',
        [
          select('kind', ['api', 'client', 'projects']),
          text('title'),
          text('description', 2000),
          linkFields('link'),
          ui('ui', ['symbol']),
        ],
        3,
      ),
    ]),
    group('faq', [
      heading(true),
      linkFields('documentationLink'),
      rows(
        'items',
        [
          field('key', 'text', { maxLength: 80, validate: slugRule }),
          text('question', 1000),
          text('answer', 10000),
          linkFields('link'),
          text('afterLink', 2000),
        ],
        100,
      ),
    ]),
    group('closing', [
      text('title'),
      text('description', 4000),
      linkFields('primaryLink'),
      linkFields('secondaryLink'),
      ui('ui', ['symbol']),
    ]),
    seoFields(),
  ],
  { singleton: true },
);
