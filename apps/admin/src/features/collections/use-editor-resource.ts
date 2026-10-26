'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAccessControl } from '../access-control/provider';
import { readEditor } from './read-editor';
import { createEditorReader } from './editor-reader';
import { collectionScope } from './content-policy';
interface EditorResourceInput {
  collection: string;
  id?: string | undefined;
  locale?: string | undefined;
  uploadId?: string | undefined;
}
export function useEditorResource({ collection, id, locale, uploadId }: EditorResourceInput) {
  const access = useAccessControl();
  const { reportResult } = access;
  const scope = collectionScope(collection);
  const intent = readIntent(id, access.can('documents.update', scope));
  const enabled =
    access.can('collections.get', scope) &&
    access.can('collections.editor', scope) &&
    access.can('documents.get', scope) &&
    (!uploadId || access.can('assets.readUpload', scope));
  const key = JSON.stringify([collection, id, locale, uploadId]);
  const [revision, setRevision] = useState(0);
  const [reader] = useState(createEditorReader);
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  useEffect(
    () =>
      reader.start({
        key,
        enabled,
        load: (signal) => readEditor({ collection, id, locale, intent, uploadId, signal }),
        report: reportResult,
        revision,
      }),
    [reader, key, enabled, collection, id, locale, intent, uploadId, revision, reportResult],
  );
  return {
    key,
    phase: resourcePhase(enabled, state.key === key, state.phase),
    data: state.key === key ? state.data : null,
    error: state.key === key ? state.error : null,
    reload: () => setRevision((value) => value + 1),
  };
}
function readIntent(id: string | undefined, write: boolean) {
  if (!id) return 'create';
  return write ? 'update' : 'read';
}
function resourcePhase(enabled: boolean, matches: boolean, phase: 'loading' | 'ready' | 'failed') {
  if (!enabled) return 'failed';
  return matches ? phase : 'loading';
}
