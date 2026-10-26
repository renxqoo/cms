import { createHash } from 'node:crypto';
import type {
  CollectionDefinition,
  FieldDefinition,
  FieldType,
  JsonValue,
} from '@new-cms/cms/content/generate';
import { completeFields } from './publication-shape.ts';
import { validPublicRichText } from './public-rich-text.ts';
import { validExternalUrl } from './public-link.ts';
export function field(
  name: string,
  type: FieldType,
  options: Omit<Partial<FieldDefinition>, 'name' | 'type'> = {},
): FieldDefinition {
  return {
    id: name,
    name,
    type,
    ...(type === 'number' ? { max: Number.MAX_SAFE_INTEGER } : {}),
    ...options,
  };
}
export function text(name: string, maxLength = 256, localized = true) {
  return field(name, 'text', {
    maxLength,
    localized,
    validate: {
      version: 'optional-public-text.v1',
      run: (value, context) =>
        context.mode === 'draft' ||
        (typeof value === 'string' && (value === '' || value.trim().length > 0)),
    },
  });
}
export function rich(name: string) {
  return field(name, 'richText', {
    localized: true,
    validate: {
      version: 'public-rich-text.v1',
      run: (value, context) => context.mode === 'draft' || validPublicRichText(value),
    },
  });
}
export function group(
  name: string,
  fields: readonly FieldDefinition[],
  options: Partial<FieldDefinition> = {},
) {
  return field(name, 'group', { fields, ...options });
}
export function rows(name: string, fields: readonly FieldDefinition[], max = 100) {
  return field(name, 'array', { fields, max });
}
export function select(name: string, options: readonly string[], hasMany = false) {
  return field(name, 'select', { options, hasMany });
}
export function media(name: string) {
  return field(name, 'upload', { relationTo: ['media'] });
}
export function relationship(name: string, targetCollection: string, hasMany = false) {
  return field(name, 'relationship', { relationTo: [targetCollection], hasMany });
}
export function safeUrl(value: JsonValue): boolean {
  if (value === '') return true;
  return validExternalUrl(value, ['https:']);
}
export function url(name: string) {
  return field(name, 'text', {
    maxLength: 2048,
    validate: { version: 'https-url.v1', run: safeUrl },
  });
}
export const slugRule = {
  version: 'public-slug.v1',
  run: (value: JsonValue) =>
    typeof value === 'string' && value.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value),
};
export const localeRule = {
  version: 'bcp47-list.v1',
  run: (value: JsonValue) =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 20 &&
    new Set(value).size === value.length &&
    value.every((item) => typeof item === 'string' && validLocale(item)),
};
export function validLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value)[0] === value;
  } catch {
    return false;
  }
}
export function localizedRequired(name: string, maxLength: number) {
  return field(name, 'text', {
    localized: true,
    required: true,
    maxLength,
    validate: {
      version: 'nonblank.v1',
      run: (value, context) =>
        context.mode === 'draft' || (typeof value === 'string' && value.trim().length > 0),
    },
  });
}
export function seoFields() {
  return group('seo', [
    text('title'),
    text('description', 2000),
    media('image'),
    field('allowIndex', 'boolean', { defaultValue: true }),
  ]);
}
export function linkFields(name: string) {
  return group(name, [
    select('kind', ['internal', 'external', 'action']),
    localizedRequired('label', 256),
    text('path', 2048, false),
    text('anchor', 120, false),
    url('url'),
    select('action', ['console']),
    select('section', ['overview', 'keys', 'usage']),
  ]);
}
function scopeFields(prefix: string, fields: readonly FieldDefinition[]): FieldDefinition[] {
  return fields.map((item) => {
    const path = `${prefix}_${item.name ?? item.id}`.toLowerCase().replaceAll('-', '_');
    const id =
      path.length > 48
        ? `${path.slice(0, 32)}_${createHash('sha256').update(path).digest('hex').slice(0, 12)}`
        : path;
    return {
      ...item,
      id,
      ...(item.fields ? { fields: scopeFields(id, item.fields) } : {}),
      ...(item.blocks
        ? {
            blocks: item.blocks.map((block) => ({
              ...block,
              id: `${id.slice(0, 30)}_${createHash('sha256').update(block.key).digest('hex').slice(0, 12)}`,
              fields: scopeFields(`${id}_${block.key}`, block.fields),
            })),
          }
        : {}),
    };
  });
}
export function collection(
  key: string,
  fields: readonly FieldDefinition[],
  options: Partial<CollectionDefinition> = {},
): CollectionDefinition {
  const complete = ['site', 'home', 'documents'].includes(key);
  const configured = complete ? completeFields(fields, key) : fields;
  return {
    id: `oneaster_${key.toLowerCase().replaceAll('-', '_')}`,
    key,
    label: key,
    schemaVersion: 1,
    mode: 'drafts',
    ...(!['languages', 'message-bundles'].includes(key)
      ? { localeSource: 'languages', publicationLocalesField: 'contentLocales' }
      : {}),
    history: { maxVersions: 100, retentionMs: 604800000 },
    locales: { default: 'en', supported: ['en', 'zh'], fallback: { en: [], zh: [] } },
    ...options,
    fields: scopeFields(key.toLowerCase(), configured),
  };
}
