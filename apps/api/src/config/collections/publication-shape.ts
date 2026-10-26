import { validPublicLink } from './public-link.ts';
import type { DocumentData, FieldDefinition, JsonValue } from '@new-cms/cms/content/generate';

function object(value: JsonValue | undefined): value is DocumentData {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const optional = new Set([
  'site.apiBaseUrl',
  'site.footer.disclaimer',
  'site.header.navigation.homeLink',
  'home.faq.items.link',
  'home.faq.items.afterLink',
  'documents.navigationLabel',
  'documents.order',
  'documents.body.introduction.eyebrow',
  'documents.body.introduction.callout',
  'documents.body.next',
]);
function optionalField(field: FieldDefinition, path: string) {
  return (
    optional.has(path) ||
    path.endsWith('.seo') ||
    ['upload', 'relationship'].includes(field.type) ||
    (path.startsWith('documents.') &&
      (['eyebrow', 'navigationLabel'].includes(field.name ?? '') ||
        ['code.caption', 'code_tabs.caption', 'image.caption'].some((suffix) =>
          path.endsWith(suffix),
        )))
  );
}
export function completeFields(
  fields: readonly FieldDefinition[],
  prefix: string,
): FieldDefinition[] {
  if (linkShape(fields)) return [...fields];
  return fields.map((field) => {
    const path = `${prefix}.${field.name ?? field.id}`;
    if (path.endsWith('.seo')) return field;
    const link = field.type === 'group' && linkShape(field.fields);
    if (link)
      return {
        ...field,
        required: !optionalField(field, path),
        validate: {
          version: 'public-link.v1',
          run: (value, context) => context.mode === 'draft' || validPublicLink(value),
        },
      };
    return {
      ...field,
      ...(!optionalField(field, path) && !['array', 'blocks'].includes(field.type)
        ? { required: true }
        : {}),
      ...(['array', 'blocks'].includes(field.type) ? { defaultValue: [] } : {}),
      ...(field.fields ? { fields: completeFields(field.fields, path) } : {}),
      ...(field.blocks
        ? {
            blocks: field.blocks.map((block) => ({
              ...block,
              fields: completeFields(block.fields, `${path}.${block.key}`),
            })),
          }
        : {}),
    };
  });
}
function validField(field: FieldDefinition, value: JsonValue | undefined, path: string): boolean {
  if (optionalField(field, path) && value == null) return true;
  if (value == null) return false;
  if (typeof value === 'string' && field.type !== 'code' && !value.trim()) return false;
  if (field.type === 'group') {
    if (!object(value)) return false;
    if (linkShape(field.fields)) return validPublicLink(value);
    return validShape(field.fields ?? [], value, path);
  }
  if (field.type === 'array' || field.type === 'blocks') {
    if (!Array.isArray(value)) return false;
    return value.every((item) => validRow(field, item, path));
  }
  return true;
}
function validRow(field: FieldDefinition, value: JsonValue, path: string) {
  if (!object(value)) return false;
  const block =
    field.type === 'blocks'
      ? field.blocks?.find((candidate) => candidate.key === value['blockType'])
      : undefined;
  return validShape(
    block?.fields ?? field.fields ?? [],
    value,
    block ? `${path}.${block.key}` : path,
  );
}
export function validShape(
  fields: readonly FieldDefinition[],
  data: DocumentData,
  prefix: string,
): boolean {
  if (linkShape(fields)) return validPublicLink(data);
  return fields.every((field) => {
    const path = `${prefix}.${field.name ?? field.id}`;
    return path.endsWith('.seo') || validField(field, data[field.name ?? field.id], path);
  });
}
export function validHomeShape(data: DocumentData): boolean {
  const hero = object(data['hero']) ? data['hero'] : {};
  const workspace = object(data['workspace']) ? data['workspace'] : {};
  const useCases = object(data['useCases']) ? data['useCases'] : {};
  const quickstart = object(workspace['quickstart']) ? workspace['quickstart'] : {};
  const faq = object(data['faq']) ? data['faq'] : {};
  const keys = Array.isArray(faq['items'])
    ? faq['items'].map((item) => (object(item) ? item['key'] : null))
    : [];
  return (
    new Set(keys).size === keys.length &&
    exactKinds(hero['capabilities'], ['routing', 'keys', 'usage']) &&
    exactKinds(workspace['views'], ['overview', 'keys', 'usage']) &&
    exactKinds(useCases['items'], ['api', 'client', 'projects']) &&
    Array.isArray(quickstart['steps']) &&
    quickstart['steps'].length === 3
  );
}
function exactKinds(value: JsonValue | undefined, kinds: readonly string[]) {
  return (
    Array.isArray(value) &&
    value.length === kinds.length &&
    kinds.every(
      (kind) => value.filter((item) => object(item) && item['kind'] === kind).length === 1,
    )
  );
}

function linkShape(fields: readonly FieldDefinition[] = []) {
  return fields.some((item) => item.name === 'kind') && fields.some((item) => item.name === 'url');
}
