import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import { budgetedExecutor } from '../runtime.ts';
import { collectReferences } from '../fields/collect-references.ts';
import { remapReferencePath } from '../fields/remap-reference-path.ts';
import type { AssetsParticipants } from '@new-cms/cms/assets/composition';
import type { ContentRuntime } from '../types.ts';
import type { StoredDocument } from '../model.ts';
import type { ContentDeliveryOptions } from './types.ts';
import { readLanguages, readRows, strings } from './source.ts';
import { readPreviewGrant, assertPreviewIssuer } from './preview-grant.ts';
import { selectedLocale } from './query.ts';

const mediaInput = z.object({ bindingId: z.uuid() }).strict();
const previewInput = mediaInput.extend({ grant: z.string() });
type BindingSource = Awaited<ReturnType<AssetsParticipants['describeBinding']>>;
async function matches(
  runtime: ContentRuntime,
  tx: Parameters<AssetsParticipants['describeBinding']>[0],
  input: { source: BindingSource; row: StoredDocument; locale: string },
): Promise<boolean> {
  const { source, row, locale } = input;
  if (source.revisionId !== row.version.id) return false;
  const separator = source.sourcePath.indexOf(':');
  const bindingLocale = separator === -1 ? '_' : source.sourcePath.slice(0, separator);
  if (bindingLocale !== '_' && bindingLocale !== locale) return false;
  const definition = await runtime.resolveCollection(tx, source.collectionKey);
  const rawPath = separator === -1 ? source.sourcePath : source.sourcePath.slice(separator + 1);
  if (rawPath === '$file') return false;
  const path = remapReferencePath({
    from: runtime.store.definition(source.collectionKey, row.version.schemaVersion),
    to: definition,
    path: rawPath,
  });
  return collectReferences({
    collection: definition,
    data: row.data,
    locale,
    limits: runtime.limits,
  }).some(
    (ref) =>
      ref.media &&
      ref.path === path &&
      ref.id === source.mediaDocumentId &&
      ref.collection === source.mediaCollectionKey,
  );
}
async function authorizePublic(
  runtime: ContentRuntime,
  tx: Parameters<AssetsParticipants['describeBinding']>[0],
  bindingId: string,
): Promise<void> {
  const { assets } = runtime;
  if (!assets) fail('not_found');
  const source = await assets.describeBinding(tx, { bindingId });
  if (!['models', 'documents', 'site', 'home', 'developers'].includes(source.collectionKey))
    fail('not_found');
  const languages = await readLanguages(runtime, tx);
  for (const locale of languages.source.enabled) {
    const page = await readRows(runtime, tx, {
      collection: source.collectionKey,
      locale,
      where: {
        and: [{ field: 'id', operator: 'eq', value: source.documentId }, selectedLocale(locale)],
      },
      pageSize: 1,
    });
    const [row] = page.rows;
    if (
      row &&
      strings(row.data['contentLocales']).includes(locale) &&
      (await matches(runtime, tx, { source, row, locale }))
    )
      return;
  }
  fail('not_found');
}
function publicReader(runtime: ContentRuntime, options: ContentDeliveryOptions) {
  return async function getPublicMedia(raw: unknown, signal?: AbortSignal) {
    const parsed = mediaInput.safeParse(raw);
    if (!parsed.success) fail('invalid_input');
    const { assets } = runtime;
    if (!assets) fail('not_found');
    return runtime.database.readOnlyTransaction(
      async (executor) => {
        const tx = budgetedExecutor(executor, options.policy.maxSqlQueries);
        await authorizePublic(runtime, tx, parsed.data.bindingId);
        return assets.openBinding(tx, {
          bindingId: parsed.data.bindingId,
          ...(signal ? { signal } : {}),
        });
      },
      AbortSignal.any([
        AbortSignal.timeout(options.policy.readTimeoutMs),
        ...(signal ? [signal] : []),
      ]),
    );
  };
}
function privateReader(runtime: ContentRuntime, options: ContentDeliveryOptions) {
  return async function getPreviewMedia(raw: unknown, signal?: AbortSignal) {
    const parsed = previewInput.safeParse(raw);
    if (!parsed.success) fail('invalid_input');
    const { assets } = runtime;
    if (!assets) fail('not_found');
    const deadline = AbortSignal.any([
      AbortSignal.timeout(options.policy.readTimeoutMs),
      ...(signal ? [signal] : []),
    ]);
    return runtime.database.readOnlyTransaction(async (executor) => {
      const tx = budgetedExecutor(executor, options.policy.maxSqlQueries);
      const grant = await readPreviewGrant(tx, options, { grant: parsed.data.grant });
      const row = await assertPreviewIssuer(runtime, tx, { grant, signal: deadline });
      const source = await assets.describeBinding(tx, parsed.data);
      if (
        source.collectionKey !== 'models' ||
        source.documentId !== grant.document_id ||
        source.revisionId !== grant.revision_id ||
        !(await matches(runtime, tx, { source, row, locale: grant.locale }))
      )
        fail('not_found');
      return assets.openBinding(tx, {
        bindingId: parsed.data.bindingId,
        ...(signal ? { signal } : {}),
      });
    }, deadline);
  };
}
export function createPublicMediaApi(runtime: ContentRuntime, options: ContentDeliveryOptions) {
  return {
    getPublicMedia: publicReader(runtime, options),
    getPreviewMedia: privateReader(runtime, options),
  };
}
