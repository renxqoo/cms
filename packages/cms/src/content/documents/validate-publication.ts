import { fail } from '@new-cms/cms/platform/contracts';
import { targetReadContext } from '../queries/resolve-locale.ts';
import { validateData } from '../fields/validate-data.ts';
import { authorizeReferences, referencesForLocale } from './revision-data.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { ReferenceValue } from '../definition.ts';

export async function validatePublicationRevision(
  state: ContentState,
  input: { runtime: ContentRuntime; documentId: string; versionId: string },
): Promise<void> {
  const references: ReferenceValue[] = [];
  for (const locale of state.collection.locales.supported) {
    const data = await input.runtime.store.readRevisionData(state.tx, {
      collection: state.collection.key,
      documentId: input.documentId,
      versionId: input.versionId,
      ...targetReadContext({ collection: state.collection, locale }),
    });
    const validated = validateData({
      collection: state.collection,
      data,
      mode: 'publish',
      locale,
      limits: input.runtime.limits,
      applyDefaults: false,
    });
    for (const extension of state.collection.extensions ?? [])
      if (extension.validate && !extension.validate(validated)) fail('invalid_input');
    references.push(
      ...referencesForLocale({
        collection: state.collection,
        data: validated,
        locale,
        limits: input.runtime.limits,
      }),
    );
  }
  await authorizeReferences(state, { runtime: input.runtime, references });
}
