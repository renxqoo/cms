import type { EditorSnapshot } from './editor-read';
import type { FieldData } from '../fields/types';

type EditorCandidate = {
  collection: string;
  locale: string;
  mode: 'editing';
  data: FieldData;
} & (
  | { intent: 'create'; initialSnapshot?: string }
  | { intent: 'update' | 'copy' | 'autosave'; id: string; revision: number }
);

export function editorCandidate(snapshot: EditorSnapshot, data: FieldData): EditorCandidate {
  const shared = {
    collection: snapshot.collection.key,
    locale: snapshot.editor.locale,
    mode: 'editing' as const,
    data,
  };
  if (snapshot.document) {
    const intent =
      snapshot.editor.intent === 'copy' || snapshot.editor.intent === 'autosave'
        ? snapshot.editor.intent
        : 'update';
    return { ...shared, intent, id: snapshot.document.id, revision: snapshot.document.revision };
  }
  return {
    ...shared,
    intent: 'create' as const,
    ...(snapshot.editor.initialSnapshot
      ? { initialSnapshot: snapshot.editor.initialSnapshot }
      : {}),
  };
}
