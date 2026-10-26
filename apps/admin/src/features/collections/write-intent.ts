import type { z } from 'zod';
import { documentSchema, contentAcceptedSchema } from '../../contracts/content';
import { emptyResponseSchema } from '../../contracts/auth';
import type { OperationId } from '../../contracts/operations';
import { writablePatch } from '../fields/writable-data';
import type { DocumentCommand, DocumentChannelState, WriteIntent } from './channel-types';
const operations = {
  save: 'documents.update',
  autosave: 'documents.autosave',
  publish: 'documents.publish',
  unpublish: 'documents.unpublish',
  archive: 'documents.archive',
  copy: 'documents.copy',
  restoreVersion: 'versions.restore',
  move: 'documents.update',
  schedule: 'content.schedulePublication',
  cancelSchedule: 'content.cancelPublicationSchedule',
} as const satisfies Record<DocumentCommand['kind'], OperationId>;
const withoutKey: readonly OperationId[] = [
  'documents.update',
  'documents.unpublish',
  'documents.archive',
  'content.cancelPublicationSchedule',
];
export function commandOperation(
  state: DocumentChannelState,
  command: DocumentCommand,
): OperationId {
  return command.kind === 'save' && !state.snapshot.document
    ? 'documents.create'
    : operations[command.kind];
}
export function makeWriteIntent(
  state: DocumentChannelState,
  command: DocumentCommand,
): WriteIntent {
  const { snapshot } = state;
  const doc = snapshot.document;
  const operation = commandOperation(state, command);
  const params: Record<string, string> = { collection: snapshot.collection.key };
  if (doc) params['id'] = doc.id;
  if (command.kind === 'cancelSchedule') params['scheduleId'] = command.scheduleId;
  const body = commandBody(state, command);
  const payload = wirePayload(command, body);
  return {
    operation,
    command,
    params,
    ...payload,
    ...(!withoutKey.includes(operation) ? { key: crypto.randomUUID() } : {}),
    generation: state.generation,
    draft: structuredClone(state.draft),
    snapshot,
  };
}
function wirePayload(command: DocumentCommand, body: Readonly<Record<string, unknown>>) {
  if (command.kind === 'cancelSchedule') return {};
  if (command.kind === 'archive' || command.kind === 'unpublish') return { query: body };
  return { body };
}
function commandBody(
  state: DocumentChannelState,
  command: DocumentCommand,
): Record<string, unknown> {
  const { snapshot } = state;
  const doc = snapshot.document;
  const base = doc ? { revision: doc.revision } : {};
  switch (command.kind) {
    case 'save':
    case 'autosave':
      return {
        ...base,
        locale: snapshot.editor.locale,
        ...saveData(state, command.kind),
        ...(snapshot.upload ? { uploadId: snapshot.upload.id } : {}),
      };
    case 'move':
      return { ...base, folderId: command.folderId };
    case 'restoreVersion':
      return { ...base, versionId: command.versionId, locale: snapshot.editor.locale };
    case 'copy':
      return { ...base, locale: snapshot.editor.locale };
    case 'schedule':
      return { ...base, versionId: command.versionId, executeAt: command.executeAt };
    case 'cancelSchedule':
      return {};
    case 'publish':
    case 'unpublish':
    case 'archive':
      return base;
  }
  return base;
}
function saveData(state: DocumentChannelState, kind: 'save' | 'autosave') {
  const doc = state.snapshot.document;
  const patch = writablePatch(state.snapshot.editor.layout, doc?.data ?? {}, state.draft);
  return Object.keys(patch).length > 0 || !doc || kind === 'autosave' ? { data: patch } : {};
}

export type DocumentWriteResponse =
  | z.infer<typeof documentSchema>
  | z.infer<typeof contentAcceptedSchema>
  | undefined;
export function commandResponseSchema(command: DocumentCommand): z.ZodType<DocumentWriteResponse> {
  if (command.kind === 'schedule') return contentAcceptedSchema;
  if (command.kind === 'cancelSchedule') return emptyResponseSchema;
  return documentSchema;
}

export function retainWriteIntent(previous: WriteIntent | null, next: WriteIntent): WriteIntent {
  if (
    previous?.key &&
    JSON.stringify([previous.operation, previous.params, previous.body, previous.query]) ===
      JSON.stringify([next.operation, next.params, next.body, next.query])
  )
    return { ...next, key: previous.key };
  return next;
}
