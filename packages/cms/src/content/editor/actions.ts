import { fail } from '@new-cms/cms/platform/contracts';
import { draftSettings } from '../collections/draft-config.ts';
import { policyScope } from '../hooks/invoke.ts';
import { authorizeStateOperation, policyContext } from '../runtime.ts';
import { queryableFields } from '../fields/policy-metadata.ts';
import { denied } from '../documents/relation-scopes.ts';
import { editorActionSchema } from './contracts.ts';
import { operationState, requireEditorDocument, requireActionPrerequisites } from './context.ts';
import type { EditorContext } from './context.ts';
import type { EditorAction, EditorAccess } from './contracts.ts';
import type { CollectionDefinition } from '../definition.ts';
import type { ContentRuntime } from '../types.ts';

function controlledAction(
  collection: CollectionDefinition,
  operation: EditorAction['operationId'],
) {
  const drafts = draftSettings(collection);
  if (operation === 'documents.renameFile') return Boolean(collection.upload);
  if (operation === 'documents.copy') return !collection.disableDuplicate;
  if (operation === 'documents.copyLocale') return collection.locales.supported.length > 1;
  if (operation === 'documents.autosave') return Boolean(drafts?.autosave);
  if (operation === 'content.schedulePublication') return drafts?.schedule === true;
  return null;
}
function eligible(context: EditorContext, operation: EditorAction['operationId']): boolean {
  const {
    document,
    state: { collection },
  } = context;
  const drafts = collection.mode === 'drafts';
  if (operation === 'documents.create') return true;
  if (!document) return false;
  if (operation === 'documents.restoreTrash' || operation === 'documents.purge')
    return document.trashedAt !== null;
  if (document.trashedAt !== null) return false;
  const controlled = controlledAction(collection, operation);
  if (controlled !== null) return controlled;
  if (operation === 'versions.restore') return collection.history !== false;
  if (operation === 'documents.unpublish') return drafts && document.publishedVersionId !== null;
  if (['documents.publish', 'content.cancelPublicationSchedule'].includes(operation)) return drafts;
  return true;
}

function candidateAction(operation: EditorAction['operationId']): boolean {
  return [
    'documents.create',
    'documents.update',
    'documents.autosave',
    'documents.copy',
    'documents.copyLocale',
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
    if (input.operationId === 'documents.copyLocale') {
      const actor = await authorizeStateOperation(context.state, {
        runtime: input.runtime,
        operationId: input.operationId,
        collection: context.state.collection.key,
      });
      if (!actor) fail('unauthenticated');
      return 'conditional';
    }
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
      await queryableFields({
        ...policyScope(state),
        collection: state.collection,
        context: policyContext(state),
      }),
    );
  } catch (error) {
    if (!denied(error)) throw error;
    return new Set<string>();
  }
}
