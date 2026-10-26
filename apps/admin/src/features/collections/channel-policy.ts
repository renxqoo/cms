import { documentDirty } from './channel-data';
import type { DocumentChannelState, DocumentCommand } from './channel-types';
export function commandExecutable(
  state: DocumentChannelState,
  command: DocumentCommand,
  allowed: boolean,
) {
  if (
    !allowed ||
    state.uploading ||
    Object.keys(state.invalid).length > 0 ||
    state.phase !== 'idle'
  )
    return false;
  const saving = command.kind === 'save' || command.kind === 'autosave';
  if (saving !== documentDirty(state)) return false;
  if (
    command.kind === 'autosave' &&
    (!state.snapshot.document || state.snapshot.collection.mode !== 'drafts')
  )
    return false;
  return (
    state.snapshot.document !== null ||
    !state.snapshot.collection.upload ||
    state.snapshot.upload !== null
  );
}
export function autosaveReady(state: DocumentChannelState, allowed: boolean) {
  return (
    state.autosave &&
    state.error === null &&
    state.phase === 'idle' &&
    state.snapshot.document !== null &&
    state.snapshot.collection.mode === 'drafts' &&
    documentDirty(state) &&
    Object.keys(state.invalid).length === 0 &&
    allowed
  );
}

export function canEditDraft(state: DocumentChannelState) {
  if (state.phase === 'blocked' || state.phase === 'checking') return false;
  return (
    state.phase !== 'writing' ||
    (state.snapshot.document !== null && state.pending?.kind !== 'archive')
  );
}

export function channelReadable(can: (operation: string) => boolean) {
  return ['collections.get', 'collections.editor', 'documents.get'].every(can);
}
