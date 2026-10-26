import { writablePatch } from '../fields/writable-data';
import type { WriteIntent } from './channel-types';
import type { EditorSnapshot } from './read-editor';
import { patchMatches } from './channel-data';
export function intentMatches(intent: WriteIntent | null, snapshot: EditorSnapshot) {
  const doc = snapshot.document;
  if (!intent || !doc) return false;
  const previousRevision = intent.snapshot.document?.revision ?? 0;
  const changed = doc.revision > previousRevision;
  if (intent.command.kind === 'save' || intent.command.kind === 'autosave')
    return saveMatches(intent, snapshot);
  if (intent.command.kind === 'publish')
    return changed && doc.publishedVersionId === intent.snapshot.document?.versionId;
  if (intent.command.kind === 'unpublish') return doc.publishedVersionId === null && changed;
  if (intent.command.kind === 'move') return doc.folderId === intent.command.folderId && changed;
  return false;
}

function saveMatches(intent: WriteIntent, snapshot: EditorSnapshot) {
  const doc = snapshot.document;
  if (!doc) return false;
  const patch = writablePatch(
    intent.snapshot.editor.layout,
    intent.snapshot.document?.data ?? {},
    intent.draft,
  );
  const fileMatches =
    !intent.snapshot.upload || doc.file?.id === intent.snapshot.upload.manifest?.id;
  return (
    doc.revision > (intent.snapshot.document?.revision ?? 0) &&
    patchMatches(intent.snapshot.editor.layout, patch, doc.data) &&
    fileMatches
  );
}
