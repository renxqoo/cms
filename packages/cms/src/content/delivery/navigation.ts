import type { DocumentData } from '../definition.ts';
import type { StoredDocument } from '../model.ts';
import type { DeliverySession } from './types.ts';
import type { PublicMedia, PublicSeo, PublicTranslation } from './contracts.ts';
import { record, strings, text } from './source.ts';

export function canonicalPath(
  session: DeliverySession,
  input: { collection: string; data: DocumentData; locale?: string },
): string {
  const prefix = `/${encodeURIComponent(input.locale ?? session.locale)}`;
  if (input.collection === 'site' || input.collection === 'home') return prefix;
  return `${prefix}/${input.collection === 'documents' ? 'docs' : 'models'}/${encodeURIComponent(text(input.data['slug']))}`;
}
export function selectedLanguages(session: DeliverySession, row: StoredDocument): string[] {
  return strings(row.data['contentLocales']).filter((locale) =>
    session.enabledLocales.includes(locale),
  );
}
export function translations(
  session: DeliverySession,
  collection: string,
  row: StoredDocument,
): PublicTranslation[] {
  return selectedLanguages(session, row).map((locale) => ({
    locale,
    slug: text(row.data['slug']),
    canonicalPath: canonicalPath(session, { collection, data: row.data, locale }),
    updatedAt: row.version.createdAt,
    allowIndex: record(row.data['seo'])['allowIndex'] !== false,
  }));
}
export function projectSeo(
  session: DeliverySession,
  input: { collection: string; row: StoredDocument; media: Record<string, PublicMedia> },
): PublicSeo {
  const { row, media, collection } = input;
  const source = record(row.data['seo']);
  const hero = record(row.data['hero']);
  return {
    title: text(source['title']) || text(row.data['title']) || text(record(hero['title'])['label']),
    description:
      text(source['description']) ||
      text(row.data['summary']) ||
      text(row.data['description']) ||
      text(hero['subtitle']),
    canonicalPath: canonicalPath(session, { collection, data: row.data }),
    allowIndex: !session.preview && source['allowIndex'] !== false,
    image: media['seo.image'] ?? null,
  };
}
