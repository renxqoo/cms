import { adminQuery } from './admin-context.ts';
import { operationState } from '../editor/context.ts';
import { parseQuery } from './parse-query.ts';
import { permittedQueryFields, policyContext } from '../runtime.ts';
import { policyScope } from '../hooks/invoke.ts';
import { readableQueryFields } from '../fields/policy-metadata.ts';
import { relationScopes } from '../documents/relation-scopes.ts';
import type { ContentState, ContentRuntime } from '../types.ts';

export async function groupingContext(
  state: ContentState,
  input: { runtime: ContentRuntime; query: unknown },
) {
  const reader = await operationState(state, {
    runtime: input.runtime,
    operationId: 'documents.list',
    mode: state.mode,
  });
  const predicates = [state.predicate, reader.predicate].filter((value) => value !== undefined);
  const query = parseQuery({
    collection: state.collection,
    limits: input.runtime.limits,
    input: input.query,
  });
  const policy = predicates.length > 1 ? { and: predicates } : predicates[0];
  return {
    reader,
    query: await adminQuery(reader, input.runtime, { ...query, ...(policy ? { policy } : {}) }),
    queryableFields: await permittedQueryFields(reader, { linkedVirtual: true }),
    valueReadableFields: await readableQueryFields({
      ...policyScope(reader),
      collection: reader.collection,
      context: policyContext(reader),
    }),
    ...(await relationScopes(reader, input.runtime, { linkedVirtual: true })),
  };
}
