import type { z } from 'zod';
import { fieldOptionsInputSchema } from './field-options-input.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { parse, policyRelations, queryDefaults, permittedQueryFields } from '../runtime.ts';
import { parseQuery } from '../queries/parse-query.ts';
import { dataFieldInstances } from '../fields/structure.ts';
import { optionTargetState } from '../fields/filter-options.ts';
import { storedViews } from '../documents/stored-views.ts';
import { decorateDocuments } from '../documents/project-assets.ts';
import { withEditorCandidates } from './candidate-context.ts';
import { editorLayout } from './layout.ts';
import type { EditorCandidateContext } from './candidate-context.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

type Input = z.infer<ReturnType<typeof fieldOptionsInputSchema>>;

async function candidateReader(
  runtime: ContentRuntime,
  candidate: EditorCandidateContext,
  input: Omit<Input, 'candidate'>,
): Promise<ContentState | null> {
  const { state, data } = candidate;
  const instance = dataFieldInstances({
    fields: (await editorLayout(candidate.context, new Set())).read,
    data,
  }).find((entry) => entry.path === input.path);
  if (!instance || !['relationship', 'upload'].includes(instance.field.type)) fail('invalid_input');
  return optionTargetState(state, {
    runtime,
    data,
    ...instance,
    relationTo: input.relationTo,
    ...(candidate.context.document ? { documentId: candidate.context.document.id } : {}),
  });
}

export async function editorCandidateOptions(
  runtime: ContentRuntime,
  candidates: readonly EditorCandidateContext[],
  input: Omit<Input, 'candidate'>,
) {
  let reader: ContentState | null = null;
  const predicates = new Map<string, NonNullable<ContentState['predicate']>>();
  for (const candidate of candidates) {
    reader = await candidateReader(runtime, candidate, input);
    if (!reader) return { rows: [], total: 0, page: input.page, pageSize: input.pageSize };
    if (reader.predicate) predicates.set(JSON.stringify(reader.predicate), reader.predicate);
  }
  if (!reader) fail('invalid_input');
  const policies = [...predicates.values()];
  const policy = policies.length > 0 ? { and: policies } : undefined;
  const { page, pageSize } = input;
  const query = parseQuery({
    collection: reader.collection,
    limits: runtime.limits,
    input: {
      ...queryDefaults(reader, runtime),
      page,
      pageSize,
      ...(input.q ? { q: input.q } : {}),
      ...(input.id
        ? {
            where: { field: 'id', operator: 'eq', value: input.id },
            sort: [{ field: 'id', order: 'asc' }],
          }
        : {}),
      ...(policy ? { policy } : {}),
    },
  });
  const result = await runtime.store.queryDocuments(reader.tx, {
    collection: reader.collection.key,
    query,
    queryableFields: await permittedQueryFields(reader),
    limits: runtime.limits,
    ...(await policyRelations({ ...reader, ...(policy ? { predicate: policy } : {}) }, runtime)),
  });
  const rows = await storedViews(reader, result.rows, { runtime });
  await decorateDocuments(reader, {
    runtime,
    views: rows,
    schemaVersions: new Map(result.rows.map((row) => [row.version.id, row.version.schemaVersion])),
  });
  return { rows, total: result.total, page, pageSize };
}

export function createFieldOptionsApi(runtime: ContentRuntime) {
  return {
    async getFieldOptions(this: void, ctx: RequestContext, raw: unknown) {
      const input = parse(
        fieldOptionsInputSchema({
          ...runtime.limits,
          maxSyncBatchItems: runtime.workPolicy.maxSyncBatchItems,
        }),
        raw,
      );
      const values = Array.isArray(input.candidate) ? input.candidate : [input.candidate];
      if (values.some((candidate) => candidate.collection !== input.collection))
        fail('invalid_input');
      return withEditorCandidates(
        runtime,
        { ctx, operationId: 'collections.fieldOptions', values },
        (candidates) => editorCandidateOptions(runtime, candidates, input),
      );
    },
  };
}
