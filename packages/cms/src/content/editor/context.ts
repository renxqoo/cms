import { fail } from '@new-cms/cms/platform/contracts';
import {
  authorizeStateOperation,
  collectionPredicate,
  queryDefaults,
  policyUsesRelations,
} from '../runtime.ts';
import { relationScopes } from '../documents/relation-scopes.ts';
import { parseQuery } from '../queries/parse-query.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';
import type { DocumentRow, RelationScope } from '../model.ts';
import type { EditorAction } from './contracts.ts';
import type { EditorInput } from './input.ts';

export interface EditorContext {
  state: ContentState;
  reader: ContentState;
  selected: ContentState;
  document: DocumentRow | null;
  data: DocumentData | undefined;
  versionId: string | null;
  fallback: readonly string[];
  input: EditorInput;
  relations: Map<string, { relationScopes: RelationScope[] }>;
  requirements: Map<string, Promise<void>>;
}

export const intentOperations = {
  read: 'documents.get',
  create: 'documents.create',
  update: 'documents.update',
  autosave: 'documents.autosave',
  copy: 'documents.copy',
} as const;

export async function operationState(
  state: ContentState,
  input: { runtime: ContentRuntime; operationId: string; mode: ContentState['mode'] },
): Promise<ContentState> {
  const actor = await authorizeStateOperation(state, {
    ...input,
    collection: state.collection.key,
  });
  if (!actor) fail('unauthenticated');
  const { predicate: _old, ...base } = state;
  const next = { ...base, actor, operationId: input.operationId, mode: input.mode };
  const predicate = collectionPredicate(next);
  return { ...next, ...(predicate ? { predicate } : {}) };
}

export async function requireEditorDocument(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    document: DocumentRow;
    context: Pick<EditorContext, 'relations'>;
  },
): Promise<void> {
  const { document, runtime } = input;
  if (document.trashedAt !== null) fail('not_found');
  if (state.mode === 'published' && document.publishedVersionId === null) fail('not_found');
  if (!state.predicate) return;
  const relationKey = `${state.mode}:${JSON.stringify(state.fallbackOverride ?? null)}`;
  let scopes: { relationScopes: RelationScope[] } | undefined;
  if (policyUsesRelations(state, runtime)) {
    scopes = input.context.relations.get(relationKey);
    if (!scopes) {
      scopes = await relationScopes(state, runtime);
      input.context.relations.set(relationKey, scopes);
    }
  }
  const page = await runtime.store.queryDocuments(state.tx, {
    collection: state.collection.key,
    query: {
      ...queryDefaults(state, runtime),
      pageSize: 1,
      where: { field: 'id', operator: 'eq', value: document.id },
      policy: state.predicate,
    },
    ...scopes,
    limits: runtime.limits,
  });
  if (page.total === 0) fail('not_found');
}

function readQuery(state: ContentState, input: { runtime: ContentRuntime; values: EditorInput }) {
  return parseQuery({
    collection: state.collection,
    limits: input.runtime.limits,
    input: {
      locale: state.locale,
      mode: input.values.mode,
      ...('fallback' in input.values && input.values.fallback
        ? { fallback: input.values.fallback }
        : {}),
    },
  });
}

async function existingContext(
  context: EditorContext,
  input: {
    runtime: ContentRuntime;
    values: Exclude<EditorInput, { intent: 'create' }>;
  },
): Promise<EditorContext> {
  const { runtime, values } = input;
  const reader =
    values.intent === 'read'
      ? context.selected
      : await operationState(context.state, {
          runtime,
          operationId: 'documents.get',
          mode: values.mode,
        });
  const document = await runtime.store.readDocument(context.state.tx, {
    collection: context.state.collection.key,
    id: values.id,
  });
  for (const state of [context.state, reader, context.selected])
    await requireEditorDocument(state, { runtime, document, context });
  const versionId =
    values.mode === 'published' ? document.publishedVersionId : document.currentVersionId;
  if (!versionId) fail('not_found');
  const data = await runtime.store.readRevisionData(context.state.tx, {
    collection: context.state.collection.key,
    documentId: document.id,
    versionId,
    locale: context.state.locale,
    fallback: context.fallback,
  });
  return { ...context, reader, document, data, versionId };
}

export async function editorContext(
  state: ContentState,
  input: { runtime: ContentRuntime; values: EditorInput },
): Promise<EditorContext> {
  const { runtime, values } = input;
  const query = readQuery(state, input);
  const selected = await operationState(state, {
    runtime,
    operationId: intentOperations[values.intent],
    mode: values.mode,
  });
  if (values.intent === 'autosave' && state.collection.mode !== 'drafts') fail('invalid_input');
  const context: EditorContext = {
    state,
    selected,
    reader: { ...selected, operationId: 'documents.get' },
    document: null,
    data: undefined,
    versionId: null,
    fallback: query.fallback,
    input: values,
    relations: new Map<string, { relationScopes: RelationScope[] }>(),
    requirements: new Map<string, Promise<void>>(),
  };
  if (values.intent !== 'create') {
    const existing = await existingContext(context, { runtime, values });
    if (values.intent === 'copy')
      await requireActionPrerequisites(existing, { runtime, operationId: 'documents.copy' });
    return existing;
  }
  if (state.predicate) fail('forbidden');
  return context;
}

async function requireCopyPrerequisites(
  context: EditorContext,
  runtime: ContentRuntime,
): Promise<void> {
  await runtime.authorizeActor(context.state.tx, {
    actorId: context.state.actor.id,
    operationId: 'documents.create',
    scope: { scopeKind: 'collection', collectionKey: context.state.collection.key },
  });
  if (!context.document) fail('not_found');
  const { predicate: _old, fallbackOverride: _fallback, ...reader } = context.reader;
  for (const locale of context.state.collection.locales.supported) {
    const localized = { ...reader, locale, mode: 'editing' as const };
    const predicate = collectionPredicate(localized);
    await requireEditorDocument(
      { ...localized, ...(predicate ? { predicate } : {}) },
      {
        runtime,
        document: context.document,
        context,
      },
    );
  }
}

function requiredOperations(
  context: EditorContext,
  operation: EditorAction['operationId'],
): string[] {
  if (operation === 'content.schedulePublication') return ['documents.publish'];
  if (operation !== 'versions.restore') return [];
  return context.state.collection.mode === 'direct'
    ? ['versions.get', 'documents.update']
    : ['versions.get'];
}

async function checkActionPrerequisites(
  context: EditorContext,
  input: {
    runtime: ContentRuntime;
    operationId: EditorAction['operationId'];
  },
): Promise<void> {
  if (input.operationId === 'documents.copy')
    return requireCopyPrerequisites(context, input.runtime);
  const { fallbackOverride: _fallback, ...base } = context.state;
  for (const operationId of requiredOperations(context, input.operationId)) {
    const state = await operationState(base, {
      runtime: input.runtime,
      operationId,
      mode: 'editing',
    });
    if (context.document)
      await requireEditorDocument(state, {
        runtime: input.runtime,
        document: context.document,
        context,
      });
  }
}

export async function requireActionPrerequisites(
  context: EditorContext,
  input: {
    runtime: ContentRuntime;
    operationId: EditorAction['operationId'];
  },
): Promise<void> {
  let required = context.requirements.get(input.operationId);
  if (!required) {
    required = checkActionPrerequisites(context, input);
    context.requirements.set(input.operationId, required);
  }
  await required;
}
