import { fail } from '@new-cms/cms/platform/contracts';
import { isDeepStrictEqual } from 'node:util';
import { parse } from '../runtime.ts';
import { withEditorCandidate, withEditorCandidates } from './candidate-context.ts';
import { renderEditorCandidate } from './candidate-presentation.ts';
import type { ContentRuntime } from '../types.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { EditorPreview } from './contracts.ts';
import type { FieldOption } from '../definition.ts';

function commonValues<T>(records: readonly Readonly<Record<string, T>>[]): Record<string, T> {
  const [first] = records;
  return Object.fromEntries(
    Object.entries(first ?? {}).filter(([key, value]) =>
      records.every(
        (record) => Object.hasOwn(record, key) && isDeepStrictEqual(value, record[key]),
      ),
    ),
  );
}
function optionKey(option: FieldOption): string {
  return typeof option === 'string' ? option : option.value;
}
function commonChoices(values: readonly EditorPreview[]) {
  const keys = new Set(values.flatMap((value) => Object.keys(value.choiceOptions ?? {})));
  const result: NonNullable<EditorPreview['choiceOptions']> = {};
  for (const key of keys) {
    const options = values.flatMap((value) =>
      value.choiceOptions?.[key] ? [value.choiceOptions[key]] : [],
    );
    const [first] = options;
    result[key] = (first ?? []).filter((option) =>
      options.every((entries) => entries.some((entry) => optionKey(entry) === optionKey(option))),
    );
  }
  return keys.size > 0 ? { choiceOptions: result } : {};
}
function intersectPreviews(
  runtime: ContentRuntime,
  values: readonly EditorPreview[],
): EditorPreview {
  const keys = new Set(values.flatMap((value) => Object.keys(value.visibility)));
  return {
    behaviorHash: runtime.registry.behaviorHash,
    visibility: Object.fromEntries(
      [...keys].map((key) => [key, values.every((value) => value.visibility[key] !== false)]),
    ),
    componentProps: commonValues(values.map((value) => value.componentProps ?? {})),
    ...commonChoices(values),
  };
}
export async function previewEditor(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const values = parse(runtime.schemas['collections.previewEditor'], raw);
  if (!('candidates' in values))
    return withEditorCandidate(
      runtime,
      { ctx, operationId: 'collections.previewEditor', values },
      (candidate) => renderEditorCandidate(runtime, candidate),
    );
  if (values.candidates.some((candidate) => candidate.collection !== values.collection))
    fail('invalid_input');
  return withEditorCandidates(
    runtime,
    { ctx, operationId: 'collections.previewEditor', values: values.candidates },
    async (candidates) => {
      const results = [];
      for (const candidate of candidates)
        results.push(await renderEditorCandidate(runtime, candidate));
      return intersectPreviews(runtime, results);
    },
  );
}
