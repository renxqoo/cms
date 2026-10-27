import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition } from '../../definition.ts';
import { historicalLocale } from '../../fields/remap-locale.ts';

export async function migratePublicationSlots(
  tx: SqlExecutor,
  input: { collection: CollectionDefinition; id: string },
): Promise<boolean> {
  const { collection } = input;
  const publications = await tx.query<{
    locale: string;
    version_id: string;
    locale_schema_version: number;
  }>(
    'SELECT locale,version_id,locale_schema_version FROM content_publications WHERE document_id=$1 ORDER BY locale FOR UPDATE',
    [input.id],
  );
  const next = new Map<string, string>();
  let changed = false;
  for (const publication of publications.rows) {
    if (publication.locale_schema_version > collection.schemaVersion) fail('invalid_input');
    if (!collection.localizeStatus && publication.locale !== '*') fail('invalid_input');
    const locales = publicationLocales(collection, publication);
    if (locales.length !== 1 || locales[0] !== publication.locale) changed = true;
    for (const locale of locales) {
      const previous = next.get(locale);
      if (previous && previous !== publication.version_id) fail('invalid_input');
      next.set(locale, publication.version_id);
    }
  }
  if (!changed) return false;
  await tx.query('DELETE FROM content_publications WHERE document_id=$1', [input.id]);
  if (next.size > 0)
    await tx.query(
      'INSERT INTO content_publications(document_id,collection_id,locale,version_id,locale_schema_version) SELECT $1,$2,p.locale,p.version_id,$3 FROM jsonb_to_recordset($4::jsonb) p(locale text,version_id uuid)',
      [
        input.id,
        collection.id,
        collection.schemaVersion,
        JSON.stringify([...next].map(([locale, version_id]) => ({ locale, version_id }))),
      ],
    );
  return true;
}

function publicationLocales(
  collection: CollectionDefinition,
  publication: { locale: string; locale_schema_version: number },
): readonly string[] {
  if (publication.locale === '*')
    return collection.localizeStatus ? collection.locales.supported : ['*'];
  return collection.locales.supported.filter(
    (locale) =>
      historicalLocale({
        current: collection,
        schemaVersion: publication.locale_schema_version,
        locale,
      }) === publication.locale,
  );
}
