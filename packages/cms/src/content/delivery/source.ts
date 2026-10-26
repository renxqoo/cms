import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import { validContentLocaleCode } from '../locale-source.ts';
import { objectValue } from '../fields/json-value.ts';
import type { CollectionDefinition, ContentLocaleSource, Where } from '../definition.ts';
import type { ContentRuntime } from '../types.ts';
import type { StoredDocument, QueryInput } from '../model.ts';
import type { DeliverySession } from './types.ts';
import type { PublicLanguage, PublicLanguages } from './contracts.ts';

export async function readRows(
  runtime: Pick<ContentRuntime, 'store' | 'limits'>,
  tx: SqlExecutor,
  input: {
    collection: string;
    locale: string;
    where?: Where;
    page?: number;
    pageSize?: number;
    q?: string;
    sort?: QueryInput['sort'];
    select?: readonly string[];
    projection?: readonly string[];
    orderByPublished?: boolean;
    scan?: boolean;
  },
) {
  return runtime.store.queryDocuments(tx, {
    collection: input.collection,
    query: {
      locale: input.locale,
      fallback: [],
      mode: 'published',
      page: input.page ?? 1,
      pageSize: input.pageSize ?? runtime.limits.maxPageSize,
      ...(input.where ? { where: input.where } : {}),
      ...(input.q ? { q: input.q } : {}),
      ...(input.sort ? { sort: input.sort } : {}),
      ...(input.select ? { select: input.select } : {}),
    },
    ...(input.orderByPublished ? { orderByPublished: true } : {}),
    ...(input.scan ? { scan: true } : {}),
    ...(input.projection ? { projection: input.projection } : {}),
    limits: runtime.limits,
  });
}
export function record(value: unknown): Record<string, unknown> {
  return objectValue(value) ? value : {};
}
export function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
function languageRows(rows: readonly StoredDocument[]) {
  const locales: PublicLanguage[] = [];
  const supported: string[] = [];
  let defaultLocale: string | undefined;
  for (const { data } of rows) {
    const code = text(data['code']);
    try {
      if (!validContentLocaleCode(code) || Intl.getCanonicalLocales(code)[0] !== code)
        fail('temporarily_unavailable');
    } catch {
      fail('temporarily_unavailable');
    }
    if (supported.includes(code)) fail('temporarily_unavailable');
    supported.push(code);
    if (data['enabled'] !== true) {
      if (data['default'] === true) fail('temporarily_unavailable');
      continue;
    }
    locales.push(languageMetadata(data, code));
    if (data['default'] === true) {
      if (defaultLocale) fail('temporarily_unavailable');
      defaultLocale = code;
    }
  }
  return { locales, supported, defaultLocale };
}
function languageMetadata(data: StoredDocument['data'], code: string): PublicLanguage {
  const label = text(data['label']);
  const shortLabel = text(data['shortLabel']) || code;
  const htmlLang = text(data['htmlLang']) || code;
  if (
    !label.trim() ||
    !shortLabel.trim() ||
    (data['direction'] !== 'ltr' && data['direction'] !== 'rtl')
  )
    fail('temporarily_unavailable');
  try {
    if (!validContentLocaleCode(htmlLang) || Intl.getCanonicalLocales(htmlLang)[0] !== htmlLang)
      fail('temporarily_unavailable');
  } catch {
    fail('temporarily_unavailable');
  }
  return { code, label, shortLabel, htmlLang, direction: data['direction'] };
}
export async function readLanguages(
  runtime: Pick<ContentRuntime, 'store' | 'limits' | 'registry'>,
  tx: SqlExecutor,
): Promise<{ catalog: PublicLanguages; source: ContentLocaleSource; initialized: boolean }> {
  const collection = runtime.registry.get('languages');
  const page = await readRows(runtime, tx, {
    collection: 'languages',
    locale: collection.locales.default,
  });
  if (page.total > runtime.limits.maxLocales) fail('capacity_exceeded');
  const { locales, supported, defaultLocale } = languageRows(page.rows);
  if (page.total > 0 && (!defaultLocale || locales.length === 0)) fail('temporarily_unavailable');
  if (!defaultLocale) {
    const initial = runtime.registry.get('models').locales;
    const initialLocale = initial.default;
    return {
      catalog: { defaultLocale: initialLocale, locales: [] },
      source: { ...initial, enabled: initial.supported },
      initialized: false,
    };
  }
  return {
    catalog: {
      defaultLocale,
      locales: locales.toSorted((left, right) => left.code.localeCompare(right.code, 'en')),
    },
    source: {
      default: defaultLocale,
      supported,
      fallback: Object.fromEntries(supported.map((code) => [code, []])),
      enabled: locales.map(({ code }) => code),
    },
    initialized: true,
  };
}
export async function collectionFor(
  session: DeliverySession,
  collection: string,
): Promise<CollectionDefinition> {
  return session.runtime.resolveCollection(session.tx, collection);
}
