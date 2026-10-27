import { observeHooks } from '../hooks/api.ts';
import { functionScope } from '../hooks/invoke.ts';
import { publicationLocales } from './publication-locales.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { targetReadContext } from '../queries/resolve-locale.ts';
import { validateData } from '../fields/validate-data.ts';
import { assertFieldOptions } from '../fields/filter-options.ts';
import { authorizeReferences, referencesForLocale } from './revision-data.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';

interface PublicationInput {
  runtime: ContentRuntime;
  documentId: string;
  versionId: string;
}
type PublicationMedia = readonly { sourcePath: string; manifest: { mimeType: string } }[];
function validateApplication(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    locale: string;
    data: DocumentData;
    media: PublicationMedia;
  },
) {
  if (!input.runtime.validatePublication) return;
  const media = input.media
    .filter(
      (binding) =>
        binding.sourcePath.startsWith(`${input.locale}:`) || binding.sourcePath.startsWith('_:'),
    )
    .map((binding) => ({
      sourcePath: binding.sourcePath.slice(binding.sourcePath.indexOf(':') + 1),
      mimeType: binding.manifest.mimeType,
    }));
  if (
    !input.runtime.validatePublication({
      collection: state.collection.key,
      locale: input.locale,
      data: input.data,
      media,
    })
  )
    fail('invalid_input');
}
async function validateLocale(
  state: ContentState,
  input: PublicationInput & { locale: string; media: PublicationMedia },
): Promise<void> {
  const { runtime, locale } = input;
  const data = await runtime.store.readRevisionData(state.tx, {
    collection: state.collection.key,
    documentId: input.documentId,
    versionId: input.versionId,
    ...targetReadContext({
      collection: state.collection,
      locale,
      ...(state.collection.publicationLocalesField ? { fallback: [] } : {}),
    }),
  });
  const validated = await validateData({
    collection: state.collection,
    data,
    mode: 'publish',
    locale,
    limits: runtime.limits,
    applyDefaults: false,
    functions: functionScope({ ...state, locale }),
  });
  await observeHooks(
    { ...state, locale },
    {
      stage: 'beforePublish',
      limits: runtime.limits,
      context: { data: validated, documentId: input.documentId },
    },
  );
  validateApplication(state, { runtime, locale, data: validated, media: input.media });
  await validateReferences({ ...state, locale }, { ...input, data: validated });
}
async function validateReferences(
  state: ContentState,
  input: PublicationInput & { data: DocumentData },
): Promise<void> {
  await assertFieldOptions(state, {
    runtime: input.runtime,
    data: input.data,
    documentId: input.documentId,
  });
  await authorizeReferences(state, {
    runtime: input.runtime,
    references: referencesForLocale({
      collection: state.collection,
      data: input.data,
      locale: state.locale,
      limits: input.runtime.limits,
    }),
  });
}
export async function validatePublicationRevision(
  state: ContentState,
  input: PublicationInput,
): Promise<void> {
  const selection = state.collection.publicationLocalesField
    ? await input.runtime.store.readRevisionData(state.tx, {
        collection: state.collection.key,
        documentId: input.documentId,
        versionId: input.versionId,
        locale: state.locale,
        fallback: [],
      })
    : {};
  const locales = publicationLocales(state.collection, selection, state.locale);
  const media =
    input.runtime.validatePublication && input.runtime.assets
      ? await input.runtime.assets.listRevisionBindings(state.tx, {
          revisionIds: [input.versionId],
        })
      : [];
  for (const locale of locales) await validateLocale(state, { ...input, locale, media });
}
