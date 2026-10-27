import { assertFilteredChoices } from './filtered-choices.ts';
import { functionScope } from '../hooks/invoke.ts';
import { valueAtPath } from '../documents/data-path.ts';
import { policyScope } from '../hooks/invoke.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { invoke, hookContext, immutable } from '../hooks/invoke.ts';
import { collectionTypeConstraint } from '../hierarchy/collection-scope.ts';
import { parse, policyContext } from '../runtime.ts';
import { parseQuery } from '../queries/parse-query.ts';
import { projectData } from './policy-read.ts';
import { candidateSibling } from './sibling-data.ts';
import { dataFieldInstances } from './structure.ts';
import { collectReferences } from './collect-references.ts';
import { targetState } from '../documents/relation-scopes.ts';
import { visibleDocuments } from '../documents/visible-documents.ts';
import { whereSchema } from '../queries/where-schema.ts';
import { assertRawQueryBudget } from '../queries/query-budget.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type {
  DocumentData,
  FieldDefinition,
  FilterOptionsContext,
  Where,
  ReferenceValue,
} from '../definition.ts';

export interface FieldOptionsContext {
  field: FieldDefinition;
  path: string;
  data: DocumentData;
  relationTo: string;
  documentId?: string;
}

export async function optionTargetState(
  state: ContentState,
  input: FieldOptionsContext & { runtime: ContentRuntime },
): Promise<ContentState | null> {
  if (!input.field.relationTo?.includes(input.relationTo)) fail('invalid_input');
  const reader = await targetState(state, { runtime: input.runtime, collection: input.relationTo });
  const filter = await fieldOptionFilter(state, input);
  if (filter === false) return null;
  const typeConstraint = collectionTypeConstraint(reader.collection, state.collection.key);
  const configured = typeof filter === 'object' ? filter : undefined;
  const predicate =
    configured && typeConstraint
      ? { and: [configured, typeConstraint] }
      : (configured ?? typeConstraint);
  if (!predicate) return reader;
  return {
    ...reader,
    predicate: reader.predicate ? { and: [reader.predicate, predicate] } : predicate,
  };
}

async function fieldOptionFilter(
  state: ContentState,
  input: FieldOptionsContext & { runtime: ContentRuntime },
): Promise<boolean | Where | undefined> {
  const configured = input.field.filterOptions;
  if (!configured) return undefined;
  let result: unknown = configured;
  if (typeof configured === 'object' && 'run' in configured) {
    const { siblingData, blockData } = candidateSibling(input.data, input.path);
    const context: FilterOptionsContext = {
      ...hookContext(state, {
        data: input.data,
        path: input.path,
        ...(input.documentId ? { documentId: input.documentId } : {}),
      }),
      data: immutable(input.data),
      siblingData: immutable(siblingData),
      ...(blockData ? { blockData: immutable(blockData) } : {}),
      relationTo: input.relationTo,
      options: [],
      blockKeys: [],
      path: input.path,
    };
    result = await invoke(state, { hook: configured, context, limits: input.runtime.limits });
  }
  if (typeof result === 'boolean') return result;
  assertRawQueryBudget({ where: result }, input.runtime.limits);
  const where = parse(whereSchema, result);
  parseQuery({
    collection: state.collection,
    limits: input.runtime.limits,
    input: { policy: where },
  });
  return where;
}

export async function assertFieldOptions(
  state: ContentState,
  input: { runtime: ContentRuntime; data: DocumentData; documentId?: string },
): Promise<void> {
  const data = await projectData({
    ...policyScope(state),
    collection: state.collection,
    data: input.data,
    context: {
      ...policyContext(state, input.data),
      ...(input.documentId ? { documentId: input.documentId } : {}),
    },
  });
  const references = collectReferences({
    collection: state.collection,
    data: input.data,
    locale: state.locale,
    limits: input.runtime.limits,
  });
  for (const { field, path } of dataFieldInstances({
    fields: state.collection.fields,
    data: input.data,
  })) {
    if (field.filterOptions === undefined) continue;
    await assertFilteredChoices({
      field,
      path,
      data,
      value: valueAtPath(input.data, path),
      locale: state.locale,
      collection: state.collection.key,
      mode: state.mode,
      functions: functionScope(state),
      limits: input.runtime.limits,
      ...(input.documentId ? { documentId: input.documentId } : {}),
    });
    await assertReferenceChoices(state, { ...input, field, path, data, references });
  }
}

async function assertReferenceChoices(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    field: FieldDefinition;
    path: string;
    data: DocumentData;
    references: readonly ReferenceValue[];
    documentId?: string;
  },
) {
  const { field, path, data, references } = input;
  const selected = references.filter(
    (reference) =>
      reference.fieldId === field.id &&
      (reference.path === path || reference.path.startsWith(`${path}.`)),
  );
  for (const relationTo of new Set(selected.map((reference) => reference.collection))) {
    const reader = await optionTargetState(state, { ...input, field, path, data, relationTo });
    if (!reader)
      fail('invalid_input', {
        fieldErrors: [{ field: path, message: 'Selected reference is not allowed.' }],
      });
    const ids = selected
      .filter((reference) => reference.collection === relationTo)
      .map((reference) => reference.id);
    const visible = await visibleDocuments(reader, {
      runtime: input.runtime,
      ids,
      trashed: false,
    });
    if (ids.some((id) => !visible.has(id)))
      fail('invalid_input', {
        fieldErrors: [{ field: path, message: 'Selected reference is not allowed.' }],
      });
  }
}
