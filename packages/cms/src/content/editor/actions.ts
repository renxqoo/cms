import { policyContext } from '../runtime.ts';
import { queryableFields } from '../fields/policies.ts';
import { denied } from '../documents/relation-scopes.ts';
import { editorActionSchema } from './contracts.ts';
import { operationState, requireEditorDocument, requireActionPrerequisites } from './context.ts';
import type { EditorContext } from './context.ts';
import type { EditorAction, EditorAccess } from './contracts.ts';
import type { ContentRuntime } from '../types.ts';

function eligible(context: EditorContext, operation: EditorAction['operationId']): boolean {
  const { document } = context;
  const drafts = context.state.collection.mode === 'drafts';
  if (operation === 'documents.create') return true;
  if (!document) return false;
  if (operation === 'documents.restoreTrash' || operation === 'documents.purge')
    return document.trashedAt !== null;
  if (document.trashedAt !== null) return false;
  if (operation === 'versions.restore') return context.state.collection.history !== false;
  if (operation === 'documents.unpublish') return drafts && document.publishedVersionId !== null;
  if (
    [
      'documents.publish',
      'documents.autosave',
      'content.schedulePublication',
      'content.cancelPublicationSchedule',
    ].includes(operation)
  )
    return drafts;
  return true;
}

function candidateAction(operation: EditorAction['operationId']): boolean {
  return [
    'documents.create',
    'documents.update',
    'documents.autosave',
    'documents.copy',
    'documents.publish',
    'versions.restore',
    'content.schedulePublication',
    'content.cancelPublicationSchedule',
  ].includes(operation);
}

async function actionState(
  context: EditorContext,
  input: { runtime: ContentRuntime; operationId: EditorAction['operationId'] },
): Promise<EditorAccess> {
  if (!eligible(context, input.operationId)) return 'denied';
  try {
    const { fallbackOverride: _readFallback, ...base } = context.state;
    const state = await operationState(base, { ...input, mode: 'editing' });
    await requireActionPrerequisites(context, input);
    if (context.document && input.operationId !== 'documents.create')
      await requireEditorDocument(state, {
        runtime: input.runtime,
        document: context.document,
        context,
      });
    return candidateAction(input.operationId) || state.collection.access?.[input.operationId]
      ? 'conditional'
      : 'allowed';
  } catch (error) {
    if (!denied(error)) throw error;
    return 'denied';
  }
}

export async function editorActions(
  context: EditorContext,
  runtime: ContentRuntime,
): Promise<EditorAction[]> {
  const actions: EditorAction[] = [];
  for (const operationId of editorActionSchema.shape.operationId.options)
    actions.push({ operationId, state: await actionState(context, { runtime, operationId }) });
  return actions;
}

export async function editorQueryableFields(
  context: EditorContext,
  runtime: ContentRuntime,
): Promise<ReadonlySet<string>> {
  try {
    const state = await operationState(context.state, {
      runtime,
      operationId: 'documents.list',
      mode: context.state.mode,
    });
    return new Set(
      queryableFields({ collection: state.collection, context: policyContext(state) }),
    );
  } catch (error) {
    if (!denied(error)) throw error;
    return new Set<string>();
  }
}
