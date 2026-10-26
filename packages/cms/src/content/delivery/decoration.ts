import { fail } from '@new-cms/cms/platform/contracts';
import { collectReferences } from '../fields/collect-references.ts';
import { remapReferencePath } from '../fields/remap-reference-path.ts';
import type { CollectionDefinition, ReferenceValue } from '../definition.ts';
import type { StoredDocument } from '../model.ts';
import type { AssetsParticipants } from '@new-cms/cms/assets/composition';
import type { PublicMedia, PublicRelation, PublicDeveloper } from './contracts.ts';
import type { DeliverySession } from './types.ts';
import { collectionFor, readRows, text } from './source.ts';
import { canonicalPath } from './navigation.ts';
import { readMediaAlts, sourceMediaAlt } from './media-alt.ts';
import { readProjection } from './read-shapes.ts';

export interface Decorated {
  media: Record<string, PublicMedia>;
  relations: Record<string, PublicRelation>;
  developers: ReadonlyMap<string, PublicDeveloper>;
}
interface Source {
  collection: string;
  row: StoredDocument;
  references: ReferenceValue[];
}
type Binding = Awaited<ReturnType<AssetsParticipants['listRevisionBindings']>>[number];
async function sourceFor(
  session: DeliverySession,
  collection: string,
  row: StoredDocument,
): Promise<Source> {
  const definition = await collectionFor(session, collection);
  return {
    collection,
    row,
    references: collectReferences({
      collection: definition,
      data: row.data,
      locale: session.locale,
      limits: session.runtime.limits,
    }),
  };
}
function referenceTargets(session: DeliverySession, sources: readonly Source[]) {
  const targets = new Map<string, Set<string>>();
  for (const source of sources)
    for (const reference of source.references) {
      if (reference.media || !['models', 'documents', 'developers'].includes(reference.collection))
        continue;
      const ids = targets.get(reference.collection) ?? new Set();
      ids.add(reference.id);
      targets.set(reference.collection, ids);
    }
  if (
    [...targets.values()].reduce((total, ids) => total + ids.size, 0) >
    session.runtime.limits.maxExpandNodes
  )
    fail('capacity_exceeded');
  return targets;
}
async function readTargets(session: DeliverySession, sources: readonly Source[]) {
  const targetRows = new Map<string, StoredDocument>();
  for (const [collection, ids] of referenceTargets(session, sources)) {
    const values = [...ids];
    for (let offset = 0; offset < values.length; offset += session.runtime.limits.maxPageSize) {
      const result = await readRows(session.runtime, session.tx, {
        collection,
        projection: await readProjection(
          session,
          collection,
          collection === 'developers'
            ? ['name', 'website', 'logo', 'contentLocales']
            : ['title', 'slug'],
        ),
        locale: session.locale,
        where: {
          and: [
            {
              field: 'id',
              operator: 'in',
              value: values.slice(offset, offset + session.runtime.limits.maxPageSize),
            },
            { field: 'contentLocales', operator: 'contains', value: [session.locale] },
          ],
        },
      });
      for (const row of result.rows) targetRows.set(`${collection}:${row.document.id}`, row);
    }
  }
  return targetRows;
}
function mediaPath(
  session: DeliverySession,
  input: { source: Source; definition: CollectionDefinition },
  binding: Binding,
): string | null {
  const { source, definition } = input;
  if (binding.revisionId !== source.row.version.id) return null;
  const separator = binding.sourcePath.indexOf(':');
  const locale = separator === -1 ? '_' : binding.sourcePath.slice(0, separator);
  if (locale !== '_' && locale !== session.locale) return null;
  const rawPath = separator === -1 ? binding.sourcePath : binding.sourcePath.slice(separator + 1);
  if (rawPath === '$file') return null;
  const path = remapReferencePath({
    from: session.runtime.store.definition(source.collection, source.row.version.schemaVersion),
    to: definition,
    path: rawPath,
  });
  return source.references.some(
    (ref) =>
      ref.media &&
      ref.path === path &&
      ref.id === binding.mediaDocumentId &&
      ref.collection === binding.mediaCollectionKey,
  )
    ? path
    : null;
}
async function selectedMedia(
  session: DeliverySession,
  sources: readonly Source[],
  bindings: readonly Binding[],
) {
  const selected = new Map<string, { binding: Binding; path: string }[]>();
  for (const source of sources) {
    const definition = await collectionFor(session, source.collection);
    const values: { binding: Binding; path: string }[] = [];
    for (const binding of bindings) {
      const path = mediaPath(session, { source, definition }, binding);
      if (path !== null) values.push({ binding, path });
    }
    selected.set(source.row.version.id, values);
  }
  return selected;
}
function projectMedia(
  session: DeliverySession,
  input: {
    source: Source;
    bindings: readonly { binding: Binding; path: string }[];
    alts: ReadonlyMap<string, string>;
  },
): Record<string, PublicMedia> {
  const media: Record<string, PublicMedia> = {};
  const { source, bindings } = input;
  for (const { binding, path } of bindings) {
    const { manifest } = binding;
    media[path] = {
      bindingId: binding.bindingId,
      mediaDocumentId: binding.mediaDocumentId,
      url: `/v1/${session.preview?.versionId === source.row.version.id ? 'preview' : 'public'}/media/${binding.bindingId}`,
      mimeType: manifest.mimeType,
      bytes: manifest.bytes,
      digest: manifest.digest,
      width: manifest.width ?? null,
      height: manifest.height ?? null,
      alt: sourceMediaAlt({
        data: source.row.data,
        path,
        fallback: input.alts.get(`${binding.mediaCollectionKey}:${binding.mediaDocumentId}`) ?? '',
      }),
    };
  }
  return media;
}
function projectRelations(
  session: DeliverySession,
  source: Source,
  targets: ReadonlyMap<string, StoredDocument>,
): Record<string, PublicRelation> {
  const result: Record<string, PublicRelation> = {};
  for (const reference of source.references) {
    if (reference.media || !['models', 'documents'].includes(reference.collection)) continue;
    const key = `${reference.collection}:${reference.id}`;
    const target = targets.get(key);
    if (target)
      result[key] = {
        id: reference.id,
        collection: reference.collection,
        title: text(target.data['title']),
        url: canonicalPath(session, { collection: reference.collection, data: target.data }),
      };
  }
  return result;
}
export async function decorateRows(
  session: DeliverySession,
  collection: string,
  rows: readonly StoredDocument[],
): Promise<Map<string, Decorated>> {
  const sources = await Promise.all(rows.map((row) => sourceFor(session, collection, row)));
  const targets = await readTargets(session, sources);
  const developers = new Map<string, PublicDeveloper>();
  for (const [key, row] of targets)
    if (key.startsWith('developers:')) {
      sources.push(await sourceFor(session, 'developers', row));
      developers.set(row.document.id, {
        id: row.document.id,
        title: text(row.data['name']),
        website: text(row.data['website']) || null,
        logo: null,
      });
    }
  const bindings = session.runtime.assets
    ? await session.runtime.assets.listRevisionBindings(session.tx, {
        revisionIds: sources.map(({ row }) => row.version.id),
      })
    : [];
  const result = new Map<string, Decorated>();
  const selected = await selectedMedia(session, sources, bindings);
  const alts = await readMediaAlts(
    session,
    [...selected.values()].flatMap((values) => values.map(({ binding }) => binding)),
  );
  for (const source of sources) {
    const media = projectMedia(session, {
      source,
      bindings: selected.get(source.row.version.id) ?? [],
      alts,
    });
    const developer = developers.get(source.row.document.id);
    if (developer) developer.logo = media['logo'] ?? null;
    result.set(source.row.version.id, {
      media,
      relations: projectRelations(session, source, targets),
      developers,
    });
  }
  return result;
}
