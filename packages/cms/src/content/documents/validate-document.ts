import { CmsError } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { createRunner, ensureVisible, parse, requireRevision } from '../runtime.ts';
import { functionScope } from '../hooks/invoke.ts';
import { validateData } from '../fields/validate-data.ts';
import { assertFieldOptions } from '../fields/filter-options.ts';
import { validateHierarchyReferences } from '../hierarchy/validation.ts';
import { authorizeReferences, languageInput } from './revision-data.ts';
import { inputPatches, prepareLocaleWrite, readLocaleData } from './prepare-write.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { ValidationInput } from './validation-input.ts';
import type { LocaleData } from './prepare-write.ts';

interface FieldError {
  field: string;
  message: string;
  locale?: string;
}

function valueErrors(error: unknown, locale?: string): FieldError[] {
  if (!(error instanceof CmsError) || error.code !== 'invalid_input' || !error.fieldErrors?.length)
    throw error;
  return error.fieldErrors.map((entry) => ({ ...entry, ...(locale ? { locale } : {}) }));
}

async function validateLocales(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    dataByLocale: LocaleData;
    mode: 'draft' | 'publish';
    id?: string;
  },
): Promise<FieldError[]> {
  const errors: FieldError[] = [];
  for (const [locale, data] of Object.entries(input.dataByLocale)) {
    try {
      await validateData({
        collection: state.collection,
        data,
        locale,
        mode: input.mode,
        limits: input.runtime.limits,
        functions: functionScope({ ...state, locale }),
      });
      await assertFieldOptions(
        { ...state, locale },
        { runtime: input.runtime, data, ...(input.id ? { documentId: input.id } : {}) },
      );
    } catch (error) {
      errors.push(...valueErrors(error, locale));
    }
  }
  return errors;
}

async function uniqueErrors(
  state: ContentState,
  input: { runtime: ContentRuntime; dataByLocale: LocaleData; id?: string },
): Promise<FieldError[]> {
  const conflicts = await input.runtime.store.conflictingUniqueFields(state.tx, {
    collection: state.collection.key,
    dataByLocale: input.dataByLocale,
    ...(input.id ? { id: input.id } : {}),
  });
  return conflicts.flatMap((conflict) =>
    conflict.fields.map((field) => ({
      field,
      message: 'Value must be unique.',
      ...(conflict.locale ? { locale: conflict.locale } : {}),
    })),
  );
}

async function validateCandidate(
  state: ContentState,
  runtime: ContentRuntime,
  input: ValidationInput,
) {
  const language = languageInput(input);
  const document =
    'id' in input ? await ensureVisible(state, { runtime, id: input.id }) : undefined;
  if (document && 'revision' in input) requireRevision(document, input.revision);
  const current = await readLocaleData(state, {
    runtime,
    ...(document ? { document } : {}),
  });
  let prepared;
  try {
    prepared = await prepareLocaleWrite(state, {
      runtime,
      current,
      patches: inputPatches(state, language),
      creating: !document,
      access: 'validate',
      ...(document ? { documentId: document.id } : {}),
    });
  } catch (error) {
    return { valid: false, errors: valueErrors(error) };
  }
  const errors = await validateLocales(state, {
    runtime,
    dataByLocale: Object.fromEntries(
      Object.entries(prepared.dataByLocale).filter(([locale]) =>
        Object.hasOwn(inputPatches(state, language), locale),
      ),
    ),
    mode: input.mode,
    ...(document ? { id: document.id } : {}),
  });
  await authorizeReferences(state, { runtime, references: prepared.references });
  await validateHierarchyReferences(state, { runtime, references: prepared.references });
  errors.push(
    ...(await uniqueErrors(state, {
      runtime,
      dataByLocale: prepared.dataByLocale,
      ...(document ? { id: document.id } : {}),
    })),
  );
  return { valid: errors.length === 0, errors };
}

async function validateDocument(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.validate'], raw);
  const language = languageInput(input);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.validate',
      collection: input.collection,
      ...(language.locale ? { locale: language.locale } : {}),
    },
    (state) => validateCandidate(state, runtime, input),
  );
}

export function createValidationApi(runtime: ContentRuntime) {
  return {
    validateDocument: (ctx: RequestContext, raw: unknown) => validateDocument(runtime, ctx, raw),
  };
}
