import { failure } from '../../api/result';
import type { Collection } from '../../contracts/content';
import type { CollectionEditor } from '../../contracts/editor';
import type { UploadSession } from '../../contracts/assets';
import { newFieldData } from '../fields/initialize-data';
import { matchingEditor } from '../collections/editor-read';
import { writeEditor } from '../collections/editor-write';
import type { EditorWrite } from '../collections/editor-controller';

function resourceData(editor: CollectionEditor, filename: string) {
  const data = newFieldData(editor.layout, () => crypto.randomUUID());
  const title = editor.layout.find(
    (node) => node.name === 'title' && node.type === 'text' && node.write !== 'denied',
  )?.name;
  return title ? { ...data, [title]: filename } : data;
}

export function createResourceSaver(options: {
  collection: Collection;
  editor: CollectionEditor;
  onCreated: () => void;
}) {
  const writes = new Map<string, EditorWrite>();
  return async (session: UploadSession, signal: AbortSignal) => {
    const snapshot = { collection: options.collection, editor: options.editor, document: null };
    if (
      !matchingEditor(snapshot, {
        collection: options.collection.key,
        id: null,
        locale: options.editor.locale,
        intent: 'create',
      })
    )
      return failure('version_conflict', 409);
    let input = writes.get(session.id);
    if (!input) {
      input = {
        action: 'save',
        snapshot,
        data: resourceData(options.editor, session.filename),
        folderId: null,
        uploadId: session.id,
        key: session.id,
        generation: 0,
      };
      writes.set(session.id, input);
    }
    const result = await writeEditor(input, signal);
    if (result.ok && !signal.aborted) options.onCreated();
    return result;
  };
}
