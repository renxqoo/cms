import { fail } from '@new-cms/cms/platform/contracts';
import type { StoredDocument } from '../model.ts';
import type { DeliverySession } from './types.ts';
import type { PublicIndexItem, PublicSitemapItem, PublicTranslation } from './contracts.ts';
import { readRows, record, strings, text } from './source.ts';
import { selectedLocale } from './query.ts';
import { canonicalPath } from './navigation.ts';
import { modelCategory } from './value.ts';
import { documentIndex } from './readers.ts';
import type { ExportInput } from './export-input.ts';
import { readProjection, documentNavigationFields } from './read-shapes.ts';
async function* rootItems(localized: DeliverySession): AsyncGenerator<PublicIndexItem> {
  const { locale } = localized;
  const session = localized;
  const [home] = (
    await readRows(session.runtime, session.tx, {
      collection: 'home',
      projection: await readProjection(session, 'home', ['contentLocales', 'seo.allowIndex']),
      locale,
      where: selectedLocale(locale),
      pageSize: 1,
    })
  ).rows;
  if (home && record(home.data['seo'])['allowIndex'] !== false)
    yield sitemapItem(localized, 'home', home);
  const [site] = (
    await readRows(session.runtime, session.tx, {
      collection: 'site',
      projection: await readProjection(session, 'site', ['contentLocales', 'seo.allowIndex']),
      locale,
      where: selectedLocale(locale),
      pageSize: 1,
    })
  ).rows;
  if (site && record(site.data['seo'])['allowIndex'] !== false) {
    for (const section of ['models', 'docs'])
      yield {
        locale,
        canonicalPath: `/${encodeURIComponent(locale)}/${section}`,
        updatedAt: site.version.createdAt,
        translations: strings(site.data['contentLocales'])
          .filter((code) => session.enabledLocales.includes(code))
          .map((code) => ({
            locale: code,
            slug: '',
            canonicalPath: `/${encodeURIComponent(code)}/${section}`,
            updatedAt: site.version.createdAt,
            allowIndex: true,
          })),
      };
  }
}
function sitemapItem(
  session: DeliverySession,
  collection: string,
  row: StoredDocument,
): PublicSitemapItem {
  const translations: PublicTranslation[] = strings(row.data['contentLocales'])
    .filter((locale) => session.enabledLocales.includes(locale))
    .map((locale) => ({
      locale,
      slug: text(row.data['slug']),
      canonicalPath: canonicalPath(session, { collection, data: row.data, locale }),
      updatedAt: row.version.createdAt,
      allowIndex: record(row.data['seo'])['allowIndex'] !== false,
    }));
  return {
    locale: session.locale,
    canonicalPath: canonicalPath(session, { collection, data: row.data }),
    updatedAt: row.version.createdAt,
    translations,
  };
}
async function* collectionItems(
  session: DeliverySession,
  collection: 'models' | 'documents',
  kind: ExportInput['kind'],
): AsyncGenerator<PublicIndexItem> {
  let cursor: string | undefined;
  while (true) {
    const where = cursor
      ? {
          and: [
            selectedLocale(session.locale),
            { field: 'id' as const, operator: 'gt' as const, value: cursor },
          ],
        }
      : selectedLocale(session.locale);
    const rows = await readRows(session.runtime, session.tx, {
      collection,
      projection: await readProjection(session, collection, exportFields(collection, kind)),
      locale: session.locale,
      where,
      pageSize: session.options.policy.exportBatchSize,
      sort: [{ field: 'id', order: 'asc' }],
      scan: true,
    });
    for (const row of rows.rows) {
      if (kind === 'sitemap') {
        if (record(row.data['seo'])['allowIndex'] !== false)
          yield sitemapItem(session, collection, row);
      } else if (collection === 'documents') yield documentIndex(row);
      else
        yield {
          id: row.document.id,
          slug: text(row.data['slug']),
          title: text(row.data['title']),
          summary: text(row.data['summary']),
          modelId: text(row.data['modelId']),
          primaryCategory: modelCategory(row.data['primaryCategory']),
        };
    }
    if (rows.rows.length < session.options.policy.exportBatchSize) return;
    cursor = rows.rows.at(-1)?.document.id;
    if (!cursor) fail('internal_error');
  }
}
function exportFields(collection: string, kind: ExportInput['kind']): readonly string[] {
  if (kind === 'sitemap') return ['slug', 'contentLocales', 'seo.allowIndex'];
  if (collection === 'documents') return documentNavigationFields;
  return ['slug', 'title', 'summary', 'modelId', 'primaryCategory'];
}
export async function* allItems(
  session: DeliverySession,
  input: ExportInput,
): AsyncGenerator<PublicIndexItem> {
  if (input.kind !== 'sitemap') {
    yield* collectionItems(
      session,
      input.kind === 'documents' ? 'documents' : 'models',
      input.kind,
    );
    return;
  }
  for (const locale of session.enabledLocales) {
    const localized = { ...session, locale };
    yield* rootItems(localized);
    yield* collectionItems(localized, 'models', 'sitemap');
    yield* collectionItems(localized, 'documents', 'sitemap');
  }
}
