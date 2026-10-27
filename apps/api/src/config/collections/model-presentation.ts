import { profileFlows, profileKeys } from '@new-cms/cms/content/delivery';
import type {
  CollectionDefinition,
  DocumentData,
  FieldDefinition,
} from '@new-cms/cms/content/generate';
import { modelLabels, modelOptionLabels } from './model-labels.ts';

const descriptions: Record<string, [string, string]> = {
  modelId: [
    'Must match the business model ID in Core. Editing this value does not change Core.',
    '须与 Core 的业务模型 ID 一致；修改此值不会修改 Core 配置。',
  ],
  slug: [
    'Public page address. Changing it changes the model URL.',
    '公开页面地址标识；修改后模型页面地址会变化。',
  ],
  technicalCapabilities: [
    'Documented model capabilities; actual access is determined by Core.',
    '有来源的模型技术能力；实际调用权限与可用性由 Core 决定。',
  ],
  specifications: [
    'Model specifications, not platform execution limits. Leave unknown values empty.',
    '模型本身的技术规格，不代表平台执行限制；未知值留空。',
  ],
  parameterReference: [
    'Reference parameters for local editing and copying; these do not submit requests.',
    '资料参数仅供本地编辑和复制，不用于提交真实调用。',
  ],
  apiBindings: [
    'Published integration examples; execution, pricing and routing remain in Core.',
    '公开接入说明与请求示例；真实执行、计价及路由仍由 Core 负责。',
  ],
  'apiBindings.constraints': [
    'Documented integration limits must stay within the implemented Core contract.',
    '接入说明中的限制必须符合已实现的 Core 合同。',
  ],
  'showcase.settings': [
    'Recorded settings of this sample; not platform defaults.',
    '该样例记录的参数，不是平台调用默认值。',
  ],
  'specifications.text.parameterCountBillions': [
    'Unit: billion parameters.',
    '单位：十亿参数（B）。',
  ],
  'specifications.audio.sampleRateHz': ['Unit: Hz.', '单位：Hz。'],
};

const sections: [string, string, string, string[]][] = [
  [
    'identity',
    'Basic information',
    '基本信息',
    [
      'modelId',
      'slug',
      'title',
      'summary',
      'contentLocales',
      'developer',
      'family',
      'logo',
      'version',
      'versionKind',
      'releaseDate',
      'officialUrl',
      'primaryCategory',
    ],
  ],
  [
    'technical',
    'Technical information and parameters',
    '技术资料与参数',
    ['technicalCapabilities', 'parameterReference', 'specifications'],
  ],
  ['integration', 'Integrations', '接入方式', ['apiBindings', 'defaultBindingKey']],
  ['content', 'Content', '详情内容', ['content']],
  ['showcase', 'Samples', '展示样例', ['showcase']],
  ['presentation', 'Presentation and SEO', '推荐与 SEO', ['presentation', 'seo']],
];

function binding(data: DocumentData, path: string | undefined): DocumentData {
  const rows = Array.isArray(data['apiBindings']) ? data['apiBindings'] : [];
  return (
    rows.find(
      (row): row is DocumentData =>
        row !== null &&
        typeof row === 'object' &&
        !Array.isArray(row) &&
        row['id'] === path?.split('.')[1],
    ) ?? {}
  );
}

function customize(field: FieldDefinition, path: string): FieldDefinition {
  const name = field.name ?? field.id;
  const kind = componentKind(path);
  const result: FieldDefinition = {
    ...field,
    label: { en: modelLabels[name]?.[0] ?? name, zh: modelLabels[name]?.[1] ?? name },
    ...(field.fields ? { fields: presentFields(field.fields, path) } : {}),
    ...(field.options
      ? {
          options: field.options.map((option) => {
            const value = typeof option === 'string' ? option : option.value;
            return { value, label: { en: value, zh: modelOptionLabels[value] ?? value } };
          }),
        }
      : {}),
    admin: {
      ...field.admin,
      ...(kind
        ? {
            components: {
              ...field.admin?.components,
              Field: { id: 'cms/model-field', props: { kind } },
            },
          }
        : {}),
    },
  };
  addPresentationRules(result, path);
  return result;
}

function componentKind(path: string): string | undefined {
  if (path === 'contentLocales') return 'locales';
  if (path === 'apiBindings') return 'bindings';
  if (path === 'summary') return 'multiline';
  if (['specifications.audio.languages', 'content.sources.supports'].includes(path))
    return 'strings';
  if (path === 'showcase.provenance') return 'provenance';
  if (path === 'apiBindings.scenarios.requestValues') return 'request';
  if (path === 'defaultBindingKey') return 'bindingKey';
  if (path.endsWith('defaultScenarioKey')) return 'scenarioKey';
  return undefined;
}

function addPresentationRules(field: FieldDefinition, path: string) {
  if (!field.admin) return;
  const description = descriptions[path];
  if (description) field.admin.description = { en: description[0], zh: description[1] };
  if (path === 'apiBindings.recipeKeys') {
    field.defaultValue = ['core.http'];
    field.admin.readOnly = true;
  }
  if (/^apiBindings\.(inputModalities|outputModalities|capabilities)$/u.test(path))
    field.admin.readOnly = true;
  if (path === 'apiBindings.enabledFlowKeys')
    field.filterOptions = {
      version: 'model-profile-flows.v1',
      run: ({ siblingData }) => {
        const profile = profileKeys.find((key) => key === siblingData['profileKey']);
        return profile ? [...profileFlows[profile]] : false;
      },
    };
  if (path === 'apiBindings.scenarios.flowKey')
    field.filterOptions = {
      version: 'model-scenario-flows.v1',
      run: ({ data, path: sourcePath }) => {
        const selected = binding(data, sourcePath)['enabledFlowKeys'];
        return Array.isArray(selected)
          ? selected.filter((key): key is string => typeof key === 'string')
          : false;
      },
    };
  if (path.startsWith('parameterReference.fields.')) parameterCondition(field);
  if (path.startsWith('showcase.')) showcaseCondition(field);
}

function parameterCondition(field: FieldDefinition) {
  const types: Record<string, string[]> = {
    options: ['select'],
    min: ['number', 'array', 'object'],
    max: ['number', 'array', 'object'],
    step: ['number'],
    placeholder: ['text', 'textarea', 'url'],
  };
  const selected = types[field.name ?? ''];
  if (selected && field.admin)
    field.admin.condition = {
      version: 'model-parameter-type.v1',
      run: ({ siblingData }) =>
        typeof siblingData['type'] === 'string' && selected.includes(siblingData['type']),
    };
}

function showcaseCondition(field: FieldDefinition) {
  const types: Record<string, string[]> = {
    media: ['image', 'video', 'audio'],
    poster: ['video'],
    alt: ['image', 'video'],
    outputText: ['text'],
  };
  const selected = types[field.name ?? ''];
  if (selected && field.admin)
    field.admin.condition = {
      version: 'model-sample-media.v1',
      run: ({ siblingData }) =>
        typeof siblingData['mediaType'] === 'string' && selected.includes(siblingData['mediaType']),
    };
}

function presentFields(fields: readonly FieldDefinition[], parent = ''): FieldDefinition[] {
  return fields.map((field) => customize(field, [parent, field.name].filter(Boolean).join('.')));
}

export function presentModels(collection: CollectionDefinition): CollectionDefinition {
  const fields = presentFields(collection.fields);
  return {
    ...collection,
    label: 'Models',
    admin: {
      ...collection.admin,
      useAsTitle: 'title',
      defaultColumns: ['title', 'modelId', 'primaryCategory', 'developer', 'presentation.featured'],
      description: {
        en: 'Model documentation, integration examples and published samples.',
        zh: '管理模型资料、公开接入说明和展示样例。',
      },
    },
    fields: [
      {
        id: 'models_editor_sections',
        type: 'tabs',
        label: { en: 'Model information', zh: '模型资料' },
        tabs: sections.map(([id, en, zh, names]) => ({
          id: `models_editor_${id}`,
          label: { en, zh },
          fields: names.flatMap((name) => fields.filter((field) => field.name === name)),
        })),
      },
    ],
  };
}
