import { draftSettings } from '../collections/draft-config.ts';
import { validateData } from '../fields/validate-data.ts';
import { functionScope } from '../hooks/invoke.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { LocaleData } from '../documents/prepare-write.ts';

export async function validateDraftData(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    dataByLocale: LocaleData;
    requested: readonly string[];
    validationLocales?: readonly string[];
    access?: 'validate';
  },
): Promise<void> {
  if (input.access === 'validate' || !draftSettings(state.collection)?.validate) return;
  for (const locale of input.validationLocales ?? input.requested) {
    await validateData({
      collection: state.collection,
      data: input.dataByLocale[locale] ?? {},
      locale,
      mode: 'draft',
      requireComplete: true,
      limits: input.runtime.limits,
      functions: functionScope({ ...state, locale }),
    });
  }
}
